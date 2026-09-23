package xyz.shiguangjian.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final int BUFFER_SIZE = 16 * 1024;
    private static final long MAX_APK_SIZE = 250L * 1024L * 1024L;
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            PackageInfo packageInfo = getInstalledPackageInfo();
            JSObject result = new JSObject();
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            result.put("versionCode", getVersionCode(packageInfo));
            result.put("packageName", getContext().getPackageName());
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("无法读取当前应用版本", "VERSION_READ_FAILED", exception);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        if (downloadUrl == null || !downloadUrl.startsWith("https://")) {
            call.reject("更新地址无效，仅允许 HTTPS 下载", "INVALID_UPDATE_URL");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(permissionIntent);

            JSObject result = new JSObject();
            result.put("status", "permission_required");
            call.resolve(result);
            return;
        }

        Long expectedVersionCode = getOptionalLong(call, "expectedVersionCode");
        String expectedSha256 = call.getString("expectedSha256");

        execute(() -> {
            File updateDirectory = new File(getContext().getCacheDir(), "updates");
            File temporaryApk = new File(updateDirectory, "shiguangjian-update.download");
            File updateApk = new File(updateDirectory, "shiguangjian-update.apk");

            try {
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new UpdateException("无法创建更新缓存目录", "CACHE_CREATE_FAILED");
                }

                deleteIfPresent(temporaryApk);
                downloadApk(downloadUrl, temporaryApk);
                verifyApk(temporaryApk, expectedVersionCode, expectedSha256);
                replaceFile(temporaryApk, updateApk);
                launchInstaller(updateApk);

                JSObject result = new JSObject();
                result.put("status", "installer_opened");
                call.resolve(result);
            } catch (UpdateException exception) {
                deleteIfPresent(temporaryApk);
                call.reject(exception.getMessage(), exception.code, exception);
            } catch (Exception exception) {
                deleteIfPresent(temporaryApk);
                call.reject("更新包下载或安装失败", "UPDATE_FAILED", exception);
            }
        });
    }

    private void downloadApk(String downloadUrl, File destination) throws UpdateException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(60_000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            connection.setRequestProperty("User-Agent", "Shiguangjian-Android-Updater");
            connection.connect();

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new UpdateException("更新包下载失败，服务器返回 " + responseCode, "DOWNLOAD_HTTP_ERROR");
            }

            long contentLength = connection.getContentLengthLong();
            if (contentLength > MAX_APK_SIZE) {
                throw new UpdateException("更新包体积异常", "APK_TOO_LARGE");
            }

            long totalBytes = 0;
            byte[] buffer = new byte[BUFFER_SIZE];
            try (
                BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(destination)
            ) {
                int bytesRead;
                while ((bytesRead = input.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > MAX_APK_SIZE) {
                        throw new UpdateException("更新包体积异常", "APK_TOO_LARGE");
                    }
                    output.write(buffer, 0, bytesRead);
                }
                output.getFD().sync();
            }

            if (totalBytes == 0) {
                throw new UpdateException("下载到的更新包为空", "EMPTY_APK");
            }
        } catch (UpdateException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new UpdateException("无法下载更新包，请检查网络后重试", "DOWNLOAD_FAILED", exception);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void verifyApk(File apkFile, Long expectedVersionCode, String expectedSha256) throws UpdateException {
        PackageManager packageManager = getContext().getPackageManager();
        PackageInfo archiveInfo = packageManager.getPackageArchiveInfo(apkFile.getAbsolutePath(), getSigningFlags());
        if (archiveInfo == null) {
            throw new UpdateException("下载文件不是有效的 Android 安装包", "INVALID_APK");
        }

        String currentPackageName = getContext().getPackageName();
        if (!currentPackageName.equals(archiveInfo.packageName)) {
            throw new UpdateException("更新包与当前应用不匹配", "PACKAGE_MISMATCH");
        }

        try {
            PackageInfo installedInfo = getInstalledPackageInfo();
            long installedVersionCode = getVersionCode(installedInfo);
            long archiveVersionCode = getVersionCode(archiveInfo);
            if (archiveVersionCode <= installedVersionCode) {
                throw new UpdateException("更新包版本必须高于当前版本", "VERSION_NOT_NEWER");
            }
            if (expectedVersionCode != null && archiveVersionCode != expectedVersionCode) {
                throw new UpdateException("更新包版本与发布信息不一致", "VERSION_MISMATCH");
            }
            if (!getSignerDigests(installedInfo).equals(getSignerDigests(archiveInfo))) {
                throw new UpdateException("更新包签名不一致，已阻止安装以保护本机日记数据", "SIGNATURE_MISMATCH");
            }
        } catch (PackageManager.NameNotFoundException exception) {
            throw new UpdateException("无法校验当前应用签名", "SIGNATURE_CHECK_FAILED", exception);
        }

        if (expectedSha256 != null && !expectedSha256.isBlank()) {
            String actualSha256 = sha256(apkFile);
            if (!actualSha256.equalsIgnoreCase(normalizeSha256(expectedSha256))) {
                throw new UpdateException("更新包完整性校验失败", "CHECKSUM_MISMATCH");
            }
        }
    }

    private PackageInfo getInstalledPackageInfo() throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(
            getContext().getPackageName(),
            getSigningFlags()
        );
    }

    private static Long getOptionalLong(PluginCall call, String key) {
        Object value = call.getData().opt(key);
        return value instanceof Number ? ((Number) value).longValue() : null;
    }

    @SuppressWarnings("deprecation")
    private static int getSigningFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
    }

    private static long getVersionCode(PackageInfo packageInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return packageInfo.getLongVersionCode();
        }
        return packageInfo.versionCode;
    }

    private static Set<String> getSignerDigests(PackageInfo packageInfo) throws UpdateException {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && packageInfo.signingInfo != null) {
            signatures = packageInfo.signingInfo.getApkContentsSigners();
        } else {
            signatures = packageInfo.signatures;
        }

        if (signatures == null || signatures.length == 0) {
            throw new UpdateException("无法读取更新包签名", "SIGNATURE_CHECK_FAILED");
        }

        Set<String> digests = new HashSet<>();
        for (Signature signature : signatures) {
            digests.add(sha256(signature.toByteArray()));
        }
        return digests;
    }

    private void launchInstaller(File apkFile) throws UpdateException {
        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, APK_MIME_TYPE);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        if (installIntent.resolveActivity(getContext().getPackageManager()) == null) {
            throw new UpdateException("设备上没有可用的安装程序", "INSTALLER_UNAVAILABLE");
        }
        getContext().startActivity(installIntent);
    }

    private static String sha256(File file) throws UpdateException {
        try (FileInputStream input = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[BUFFER_SIZE];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
            return toHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new UpdateException("无法校验更新包完整性", "CHECKSUM_FAILED", exception);
        }
    }

    private static String sha256(byte[] value) throws UpdateException {
        try {
            return toHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new UpdateException("无法校验更新包签名", "SIGNATURE_CHECK_FAILED", exception);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(String.format(Locale.US, "%02x", value & 0xff));
        }
        return result.toString();
    }

    private static String normalizeSha256(String value) {
        return value.trim().toLowerCase(Locale.US).replace("sha256:", "").replaceAll("\\s", "");
    }

    private static void replaceFile(File source, File destination) throws UpdateException {
        deleteIfPresent(destination);
        if (!source.renameTo(destination)) {
            throw new UpdateException("无法保存更新包", "CACHE_WRITE_FAILED");
        }
    }

    private static void deleteIfPresent(File file) {
        if (file.exists()) {
            file.delete();
        }
    }

    private static final class UpdateException extends Exception {
        final String code;

        UpdateException(String message, String code) {
            super(message);
            this.code = code;
        }

        UpdateException(String message, String code, Throwable cause) {
            super(message, cause);
            this.code = code;
        }
    }
}
