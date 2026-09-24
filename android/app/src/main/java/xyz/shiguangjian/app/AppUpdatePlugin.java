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
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final int BUFFER_SIZE = 16 * 1024;
    private static final int NETWORK_TIMEOUT_MS = 30_000;
    private static final long MAX_APK_SIZE = 250L * 1024L * 1024L;
    private static final long MAX_ARCHIVE_SIZE = 300L * 1024L * 1024L;
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
        String fallbackUrl = call.getString("fallbackUrl");
        String fallbackFormat = call.getString("fallbackFormat");
        if (fallbackUrl != null && !fallbackUrl.startsWith("https://")) {
            call.reject("备用更新地址无效，仅允许 HTTPS 下载", "INVALID_FALLBACK_URL");
            return;
        }

        execute(() -> {
            File updateDirectory = new File(getContext().getCacheDir(), "updates");
            File temporaryApk = new File(updateDirectory, "shiguangjian-update.download");
            File temporaryArchive = new File(updateDirectory, "shiguangjian-update.zip");
            File updateApk = new File(updateDirectory, "shiguangjian-update.apk");

            try {
                String activeSource = "github";
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new UpdateException("无法创建更新缓存目录", "CACHE_CREATE_FAILED");
                }

                deleteIfPresent(temporaryApk);
                deleteIfPresent(temporaryArchive);
                try {
                    downloadFile(downloadUrl, temporaryApk, "github", MAX_APK_SIZE);
                } catch (UpdateException primaryException) {
                    if (fallbackUrl == null || fallbackUrl.isBlank()) {
                        throw primaryException;
                    }
                    activeSource = "aliyun";
                    deleteIfPresent(temporaryApk);
                    emitProgress("switching", "aliyun", 0, -1);
                    if ("zip".equalsIgnoreCase(fallbackFormat)) {
                        downloadFile(fallbackUrl, temporaryArchive, "aliyun", MAX_ARCHIVE_SIZE);
                        extractApk(temporaryArchive, temporaryApk);
                        deleteIfPresent(temporaryArchive);
                    } else {
                        downloadFile(fallbackUrl, temporaryApk, "aliyun", MAX_APK_SIZE);
                    }
                }
                emitProgress("verifying", activeSource, 0, -1);
                verifyApk(temporaryApk, expectedVersionCode, expectedSha256);
                replaceFile(temporaryApk, updateApk);
                emitProgress("installing", activeSource, 0, -1);
                launchInstaller(updateApk);

                JSObject result = new JSObject();
                result.put("status", "installer_opened");
                call.resolve(result);
            } catch (UpdateException exception) {
                deleteIfPresent(temporaryApk);
                deleteIfPresent(temporaryArchive);
                call.reject(exception.getMessage(), exception.code, exception);
            } catch (Exception exception) {
                deleteIfPresent(temporaryApk);
                deleteIfPresent(temporaryArchive);
                call.reject("更新包下载或安装失败", "UPDATE_FAILED", exception);
            }
        });
    }

    @PluginMethod
    public void fetchJson(PluginCall call) {
        String requestUrl = call.getString("url");
        if (requestUrl == null || !requestUrl.startsWith("https://")) {
            call.reject("更新信息地址无效，仅允许 HTTPS 请求", "INVALID_JSON_URL");
            return;
        }

        execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(requestUrl).openConnection();
                connection.setConnectTimeout(NETWORK_TIMEOUT_MS);
                connection.setReadTimeout(NETWORK_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("User-Agent", "Shiguangjian-Android-Updater");
                connection.connect();
                int responseCode = connection.getResponseCode();
                if (responseCode < 200 || responseCode >= 300) {
                    throw new UpdateException("更新信息读取失败，服务器返回 " + responseCode, "JSON_HTTP_ERROR");
                }

                byte[] body = readLimited(connection.getInputStream(), 512L * 1024L);
                JSObject result = new JSObject(new String(body, StandardCharsets.UTF_8));
                call.resolve(result);
            } catch (UpdateException exception) {
                call.reject(exception.getMessage(), exception.code, exception);
            } catch (Exception exception) {
                call.reject("无法读取备用更新信息", "JSON_FETCH_FAILED", exception);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void downloadFile(String downloadUrl, File destination, String source, long maxSize) throws UpdateException {
        HttpURLConnection connection = null;
        try {
            emitProgress("connecting", source, 0, -1);
            connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
            connection.setConnectTimeout(NETWORK_TIMEOUT_MS);
            connection.setReadTimeout(NETWORK_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/zip, application/octet-stream");
            connection.setRequestProperty("User-Agent", "Shiguangjian-Android-Updater");
            connection.connect();

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new UpdateException("更新包下载失败，服务器返回 " + responseCode, "DOWNLOAD_HTTP_ERROR");
            }

            long contentLength = connection.getContentLengthLong();
            if (contentLength > maxSize) {
                throw new UpdateException("更新文件体积异常", "UPDATE_TOO_LARGE");
            }

            long totalBytes = 0;
            long lastProgressAt = 0;
            byte[] buffer = new byte[BUFFER_SIZE];
            try (
                BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(destination)
            ) {
                int bytesRead;
                while ((bytesRead = input.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > maxSize) {
                        throw new UpdateException("更新文件体积异常", "UPDATE_TOO_LARGE");
                    }
                    output.write(buffer, 0, bytesRead);
                    long now = System.currentTimeMillis();
                    if (now - lastProgressAt >= 180) {
                        emitProgress("downloading", source, totalBytes, contentLength);
                        lastProgressAt = now;
                    }
                }
                output.getFD().sync();
            }

            if (totalBytes == 0) {
                throw new UpdateException("下载到的更新文件为空", "EMPTY_UPDATE");
            }
            emitProgress("downloading", source, totalBytes, contentLength);
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

    private void extractApk(File archive, File destination) throws UpdateException {
        emitProgress("extracting", "aliyun", 0, archive.length());
        int apkEntries = 0;
        long extractedBytes = 0;
        byte[] buffer = new byte[BUFFER_SIZE];

        try (
            ZipInputStream input = new ZipInputStream(new BufferedInputStream(new FileInputStream(archive)));
            FileOutputStream output = new FileOutputStream(destination)
        ) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    input.closeEntry();
                    continue;
                }
                if (!entry.getName().toLowerCase(Locale.US).endsWith(".apk")) {
                    throw new UpdateException("备用更新压缩包包含非 APK 文件", "INVALID_UPDATE_ARCHIVE");
                }
                apkEntries += 1;
                if (apkEntries > 1) {
                    throw new UpdateException("备用更新压缩包必须只包含一个 APK", "INVALID_UPDATE_ARCHIVE");
                }

                int bytesRead;
                while ((bytesRead = input.read(buffer)) != -1) {
                    extractedBytes += bytesRead;
                    if (extractedBytes > MAX_APK_SIZE) {
                        throw new UpdateException("解压后的更新包体积异常", "APK_TOO_LARGE");
                    }
                    output.write(buffer, 0, bytesRead);
                }
                input.closeEntry();
            }
            output.getFD().sync();
        } catch (UpdateException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new UpdateException("无法解压阿里云备用更新包", "ARCHIVE_EXTRACT_FAILED", exception);
        }

        if (apkEntries != 1 || extractedBytes == 0) {
            throw new UpdateException("备用更新压缩包中没有有效 APK", "INVALID_UPDATE_ARCHIVE");
        }
    }

    private void emitProgress(String status, String source, long downloadedBytes, long totalBytes) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("source", source);
        if (downloadedBytes >= 0) event.put("downloadedBytes", downloadedBytes);
        if (totalBytes > 0) {
            event.put("totalBytes", totalBytes);
            event.put("percent", Math.min(100, Math.round(downloadedBytes * 100.0 / totalBytes)));
        }
        notifyListeners("downloadProgress", event);
    }

    private static byte[] readLimited(InputStream inputStream, long maxBytes) throws IOException, UpdateException {
        try (BufferedInputStream input = new BufferedInputStream(inputStream)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[BUFFER_SIZE];
            long totalBytes = 0;
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                totalBytes += bytesRead;
                if (totalBytes > maxBytes) {
                    throw new UpdateException("更新信息体积异常", "JSON_TOO_LARGE");
                }
                output.write(buffer, 0, bytesRead);
            }
            return output.toByteArray();
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
