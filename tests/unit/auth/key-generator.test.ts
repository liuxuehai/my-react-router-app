/**
 * 密钥生成器测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyGenerator, type KeyGenerationOptions } from "../../../app/api/auth/key-generator.js";

describe("KeyGenerator", () => {
  describe("RSA Key Generation", () => {
    it("should generate RS256 key pair", async () => {
      const keyPair = await KeyGenerator.generateRSAKeyPair("RS256");

      expect(keyPair).toBeDefined();
      expect(keyPair.keyId).toMatch(/^key_\d+_[a-z0-9]+$/);
      expect(keyPair.algorithm).toBe("RS256");
      expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
      expect(keyPair.createdAt).toBeInstanceOf(Date);
      expect(keyPair.enabled).toBe(true);
    });

    it("should generate RS512 key pair", async () => {
      const keyPair = await KeyGenerator.generateRSAKeyPair("RS512");

      expect(keyPair.algorithm).toBe("RS512");
      expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it("should generate key pair with custom options", async () => {
      const options: KeyGenerationOptions = {
        keyId: "test-key-123",
        expiryDays: 30,
        enabled: false,
        rsaKeySize: 3072,
      };

      const keyPair = await KeyGenerator.generateRSAKeyPair("RS256", options);

      expect(keyPair.keyId).toBe("test-key-123");
      expect(keyPair.enabled).toBe(false);
      expect(keyPair.expiresAt).toBeInstanceOf(Date);

      // 检查过期时间是否正确设置（大约30天后）
      const expectedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(keyPair.expiresAt!.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // 允许1秒误差
    });

    it("should generate different key pairs each time", async () => {
      const keyPair1 = await KeyGenerator.generateRSAKeyPair("RS256");
      const keyPair2 = await KeyGenerator.generateRSAKeyPair("RS256");

      expect(keyPair1.keyId).not.toBe(keyPair2.keyId);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe("ECDSA Key Generation", () => {
    it("should generate ES256 key pair", async () => {
      const keyPair = await KeyGenerator.generateECDSAKeyPair("ES256");

      expect(keyPair).toBeDefined();
      expect(keyPair.algorithm).toBe("ES256");
      expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it("should generate ES512 key pair", async () => {
      const keyPair = await KeyGenerator.generateECDSAKeyPair("ES512");

      expect(keyPair.algorithm).toBe("ES512");
      expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it("should generate key pair with custom curve", async () => {
      const options: KeyGenerationOptions = {
        ecdsaCurve: "P-384",
      };

      const keyPair = await KeyGenerator.generateECDSAKeyPair("ES256", options);

      expect(keyPair.algorithm).toBe("ES256");
      expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });
  });

  describe("Generic Key Generation", () => {
    it("should generate key pair for all supported algorithms", async () => {
      const algorithms: Array<"RS256" | "RS512" | "ES256" | "ES512"> = [
        "RS256", "RS512", "ES256", "ES512"
      ];

      for (const algorithm of algorithms) {
        const keyPair = await KeyGenerator.generateKeyPair(algorithm);

        expect(keyPair.algorithm).toBe(algorithm);
        expect(keyPair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
        expect(keyPair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
      }
    });

    it("should throw error for unsupported algorithm", async () => {
      await expect(
        KeyGenerator.generateKeyPair("INVALID" as any)
      ).rejects.toThrow("Unsupported algorithm: INVALID");
    });
  });

  describe("Batch Key Generation", () => {
    it("should generate multiple key pairs", async () => {
      const configs = [
        { algorithm: "RS256" as const },
        { algorithm: "ES256" as const },
        { algorithm: "RS512" as const, options: { keyId: "batch-key-1" } },
      ];

      const keyPairs = await KeyGenerator.generateMultipleKeyPairs(configs);

      expect(keyPairs).toHaveLength(3);
      expect(keyPairs[0].algorithm).toBe("RS256");
      expect(keyPairs[1].algorithm).toBe("ES256");
      expect(keyPairs[2].algorithm).toBe("RS512");
      expect(keyPairs[2].keyId).toBe("batch-key-1");
    });
  });

  describe("Key Validation", () => {
    it("should validate generated key pairs", async () => {
      const keyPair = await KeyGenerator.generateKeyPair("RS256");
      const isValid = await KeyGenerator.validateKeyPair(keyPair);

      expect(isValid).toBe(true);
    });

    it("should validate key pairs for all algorithms", async () => {
      const algorithms: Array<"RS256" | "RS512" | "ES256" | "ES512"> = [
        "RS256", "RS512", "ES256", "ES512"
      ];

      for (const algorithm of algorithms) {
        const keyPair = await KeyGenerator.generateKeyPair(algorithm);
        const isValid = await KeyGenerator.validateKeyPair(keyPair);

        expect(isValid).toBe(true);
      }
    });

    it("should reject invalid key pairs", async () => {
      const invalidKeyPair = {
        keyId: "invalid-key",
        publicKey: "invalid-public-key",
        privateKey: "invalid-private-key",
        algorithm: "RS256" as const,
        createdAt: new Date(),
        enabled: true,
      };

      const isValid = await KeyGenerator.validateKeyPair(invalidKeyPair);

      expect(isValid).toBe(false);
    });
  });

  describe("Key Import/Export", () => {
    it("should import and export private keys", async () => {
      const keyPair = await KeyGenerator.generateKeyPair("RS256");

      const privateKey = await KeyGenerator.importPrivateKey(
        keyPair.privateKey,
        keyPair.algorithm
      );

      expect(privateKey).toBeInstanceOf(CryptoKey);
      expect(privateKey.type).toBe("private");
    });

    it("should import and export public keys", async () => {
      const keyPair = await KeyGenerator.generateKeyPair("RS256");

      const publicKey = await KeyGenerator.importPublicKey(
        keyPair.publicKey,
        keyPair.algorithm
      );

      expect(publicKey).toBeInstanceOf(CryptoKey);
      expect(publicKey.type).toBe("public");
    });
  });

  describe("Key Information", () => {
    it("should get key information for RSA keys", async () => {
      const keyPair = await KeyGenerator.generateKeyPair("RS256");
      const keyInfo = await KeyGenerator.getKeyInfo(keyPair);

      expect(keyInfo.algorithm).toBe("RS256");
      expect(keyInfo.fingerprint).toMatch(/^[0-9A-F:]+$/);
      expect(keyInfo.createdAt).toBeInstanceOf(Date);
      expect(keyInfo.keySize).toBeGreaterThan(0);
    });

    it("should get key information for ECDSA keys", async () => {
      const keyPair = await KeyGenerator.generateKeyPair("ES256");
      const keyInfo = await KeyGenerator.getKeyInfo(keyPair);

      expect(keyInfo.algorithm).toBe("ES256");
      expect(keyInfo.fingerprint).toMatch(/^[0-9A-F:]+$/);
      expect(keyInfo.curve).toBeDefined();
    });

    it("should generate unique fingerprints", async () => {
      const keyPair1 = await KeyGenerator.generateKeyPair("RS256");
      const keyPair2 = await KeyGenerator.generateKeyPair("RS256");

      const info1 = await KeyGenerator.getKeyInfo(keyPair1);
      const info2 = await KeyGenerator.getKeyInfo(keyPair2);

      expect(info1.fingerprint).not.toBe(info2.fingerprint);
    });
  });

  describe("Convenience Functions", () => {
    it("should provide convenience functions for each algorithm", async () => {
      const { 
        generateRS256KeyPair,
        generateRS512KeyPair,
        generateES256KeyPair,
        generateES512KeyPair
      } = await import("../../../app/api/auth/key-generator.js");

      const rs256Key = await generateRS256KeyPair();
      const rs512Key = await generateRS512KeyPair();
      const es256Key = await generateES256KeyPair();
      const es512Key = await generateES512KeyPair();

      expect(rs256Key.algorithm).toBe("RS256");
      expect(rs512Key.algorithm).toBe("RS512");
      expect(es256Key.algorithm).toBe("ES256");
      expect(es512Key.algorithm).toBe("ES512");
    });
  });

  describe("Error Handling", () => {
    it("should handle key generation errors gracefully", async () => {
      // 模拟 crypto.subtle.generateKey 失败的情况
      const originalGenerateKey = crypto.subtle.generateKey;
      
      try {
        // @ts-ignore
        crypto.subtle.generateKey = vi.fn().mockRejectedValue(new Error("Crypto generation failed"));

        await expect(
          KeyGenerator.generateKeyPair("RS256")
        ).rejects.toThrow("Failed to generate RSA key pair");
      } finally {
        crypto.subtle.generateKey = originalGenerateKey;
      }
    });

    it("should validate key generation options", async () => {
      const invalidOptions: KeyGenerationOptions = {
        expiryDays: -1, // 负数应该被忽略或处理
      };

      const keyPair = await KeyGenerator.generateKeyPair("RS256", invalidOptions);

      // 负数过期天数应该被忽略
      expect(keyPair.expiresAt).toBeUndefined();
    });
  });

  describe("Performance", () => {
    it("should generate keys within reasonable time", async () => {
      const startTime = Date.now();
      
      await KeyGenerator.generateKeyPair("RS256");
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // 密钥生成应该在5秒内完成
      expect(duration).toBeLessThan(5000);
    });

    it("should handle concurrent key generation", async () => {
      const promises = Array.from({ length: 5 }, () =>
        KeyGenerator.generateKeyPair("ES256")
      );

      const keyPairs = await Promise.all(promises);

      expect(keyPairs).toHaveLength(5);
      
      // 确保所有密钥都是唯一的
      const keyIds = keyPairs.map(kp => kp.keyId);
      const uniqueKeyIds = new Set(keyIds);
      expect(uniqueKeyIds.size).toBe(5);
    });
  });
});