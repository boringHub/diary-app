package xyz.shiguangjian.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "DeviceKeyAuth")
public class DeviceKeyAuthPlugin extends Plugin {
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final Pattern ALIAS_PATTERN = Pattern.compile("^shiguangjian-device-dvc_[A-Za-z0-9_-]{1,124}$");
    private static final int MAX_SIGNING_PAYLOAD_BYTES = 16 * 1024;

    @PluginMethod
    public void ensureKey(PluginCall call) {
        String alias = readAlias(call);
        if (alias == null) return;

        try {
            KeyStore keyStore = loadKeyStore();
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate == null) {
                KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    KEYSTORE_PROVIDER
                );
                generator.initialize(new KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setRandomizedEncryptionRequired(true)
                    .build());
                KeyPair keyPair = generator.generateKeyPair();
                certificate = keyStore.getCertificate(alias);
                if (certificate == null && keyPair.getPublic() != null) {
                    resolvePublicKey(call, keyPair.getPublic().getEncoded());
                    return;
                }
            }
            if (certificate == null || certificate.getPublicKey() == null) {
                call.reject("无法读取设备公钥", "KEYSTORE_UNAVAILABLE");
                return;
            }
            resolvePublicKey(call, certificate.getPublicKey().getEncoded());
        } catch (Exception exception) {
            call.reject("无法创建或读取设备密钥", "KEYSTORE_UNAVAILABLE", exception);
        }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        String alias = readAlias(call);
        if (alias == null) return;
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null || dataBase64.isBlank()) {
            call.reject("签名内容不能为空", "SIGN_FAILED");
            return;
        }

        try {
            byte[] payload = Base64.decode(dataBase64.getBytes(StandardCharsets.US_ASCII), Base64.DEFAULT);
            if (payload.length == 0 || payload.length > MAX_SIGNING_PAYLOAD_BYTES) {
                call.reject("签名内容长度无效", "SIGN_FAILED");
                return;
            }
            KeyStore keyStore = loadKeyStore();
            PrivateKey privateKey = (PrivateKey) keyStore.getKey(alias, null);
            if (privateKey == null) {
                call.reject("设备密钥不存在", "KEY_NOT_FOUND");
                return;
            }
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(privateKey);
            signer.update(payload);

            JSObject result = new JSObject();
            result.put("signatureBase64", Base64.encodeToString(signer.sign(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (IllegalArgumentException exception) {
            call.reject("签名内容编码无效", "SIGN_FAILED", exception);
        } catch (Exception exception) {
            call.reject("设备签名失败", "SIGN_FAILED", exception);
        }
    }

    @PluginMethod
    public void hasKey(PluginCall call) {
        String alias = readAlias(call);
        if (alias == null) return;
        try {
            JSObject result = new JSObject();
            result.put("exists", loadKeyStore().containsAlias(alias));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("无法读取设备密钥状态", "KEYSTORE_UNAVAILABLE", exception);
        }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        String alias = readAlias(call);
        if (alias == null) return;
        try {
            KeyStore keyStore = loadKeyStore();
            if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias);
            call.resolve();
        } catch (Exception exception) {
            call.reject("无法删除设备密钥", "KEYSTORE_UNAVAILABLE", exception);
        }
    }

    private static KeyStore loadKeyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        return keyStore;
    }

    private String readAlias(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null || !ALIAS_PATTERN.matcher(alias).matches()) {
            call.reject("设备密钥别名无效", "KEYSTORE_UNAVAILABLE");
            return null;
        }
        return alias;
    }

    private static void resolvePublicKey(PluginCall call, byte[] publicKey) {
        JSObject result = new JSObject();
        result.put("publicKey", Base64.encodeToString(publicKey, Base64.NO_WRAP));
        call.resolve(result);
    }
}
