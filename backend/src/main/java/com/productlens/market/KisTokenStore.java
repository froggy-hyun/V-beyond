package com.productlens.market;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.function.Supplier;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name = "lens.market.mode", havingValue = "KIS")
class KisTokenStore {
    record Token(String value, Instant expiresAt) {}
    private record Stored(byte[] sealed, OffsetDateTime expiresAt, OffsetDateTime retryAfter) {}
    private record Access(Token token, boolean reserved) {}
    private static final int NONCE_BYTES = 12;
    private final SecureRandom random = new SecureRandom();
    private final TransactionTemplate transaction;
    private final JdbcClient jdbc;
    private final String credentialId;
    private final SecretKeySpec encryptionKey;

    KisTokenStore(JdbcClient jdbc, PlatformTransactionManager manager, @Value("${KIS_APP_KEY:}") String appKey,
                  @Value("${KIS_APP_SECRET:}") String appSecret) {
        this.jdbc = jdbc;
        transaction = new TransactionTemplate(manager);
        credentialId = HexFormat.of().formatHex(hash("kis:v1:identity\n" + appKey + "\n" + appSecret));
        encryptionKey = new SecretKeySpec(hash("kis:v1:encryption\n" + appSecret), "AES");
    }

    Token restoreOrIssue(Supplier<Token> issue) {
        var access = transaction.execute(status -> {
            jdbc.sql("INSERT INTO kis_access_tokens (credential_id) VALUES (:id) ON CONFLICT DO NOTHING")
                    .param("id", credentialId).update();
            // 재배포 중 활성 인스턴스가 겹쳐도 동일 자격 증명의 발급 요청은 하나로 제한
            var stored = jdbc.sql("""
                    SELECT sealed_token, expires_at, retry_after FROM kis_access_tokens
                    WHERE credential_id = :id FOR UPDATE
                    """).param("id", credentialId).query((row, n) -> new Stored(row.getBytes(1),
                    row.getObject(2, OffsetDateTime.class), row.getObject(3, OffsetDateTime.class))).single();
            var now = Instant.now();
            if (stored.sealed() != null && now.isBefore(stored.expiresAt().toInstant())) {
                return new Access(new Token(decrypt(stored.sealed()), stored.expiresAt().toInstant()), false);
            }
            if (now.isBefore(stored.retryAfter().toInstant())) return new Access(null, false);
            jdbc.sql("UPDATE kis_access_tokens SET retry_after = :retryAt WHERE credential_id = :id")
                    .param("retryAt", now.plusSeconds(3600).atOffset(ZoneOffset.UTC)).param("id", credentialId).update();
            return new Access(null, true);
        });
        if (!access.reserved()) return access.token();
        var issued = issue.get();
        jdbc.sql("""
                UPDATE kis_access_tokens SET sealed_token = :token, expires_at = :expiresAt,
                retry_after = '1970-01-01T00:00:00Z' WHERE credential_id = :id
                """).param("token", encrypt(issued.value())).param("expiresAt", issued.expiresAt().atOffset(ZoneOffset.UTC))
                .param("id", credentialId).update();
        return issued;
    }

    private static byte[] hash(String value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value.getBytes(UTF_8)); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    private byte[] encrypt(String value) {
        var nonce = new byte[NONCE_BYTES];
        random.nextBytes(nonce);
        var ciphertext = crypt(Cipher.ENCRYPT_MODE, nonce, value.getBytes(UTF_8));
        return ByteBuffer.allocate(nonce.length + ciphertext.length).put(nonce).put(ciphertext).array();
    }

    private String decrypt(byte[] sealed) {
        if (sealed.length <= NONCE_BYTES) throw new KisClient.Unavailable();
        var buffer = ByteBuffer.wrap(sealed);
        var nonce = new byte[NONCE_BYTES];
        var ciphertext = new byte[buffer.remaining() - NONCE_BYTES];
        buffer.get(nonce).get(ciphertext);
        return new String(crypt(Cipher.DECRYPT_MODE, nonce, ciphertext), UTF_8);
    }

    private byte[] crypt(int direction, byte[] nonce, byte[] value) {
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(direction, encryptionKey, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(credentialId.getBytes(UTF_8));
            return cipher.doFinal(value);
        } catch (GeneralSecurityException error) { throw new KisClient.Unavailable(); }
    }
}
