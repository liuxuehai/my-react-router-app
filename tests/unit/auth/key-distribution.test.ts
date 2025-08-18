/**
 * 密钥分发管理器测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyDistributionManager, type KeyDistributionConfig, type KeyDistributionRequest } from "../../../app/api/auth/key-distribution.js";
import { type GeneratedKeyPair } from "../../../app/api/auth/key-generator.js";

describe("KeyDistributionManager", () => {
  let distributionManager: KeyDistributionManager;
  let mockConfig: KeyDistributionConfig;
  let mockKeyPair: GeneratedKeyPair;

  beforeEach(() => {
    mockConfig = {
      encryptionKey: "test-encryption-key-32-bytes-long",
      distributionEndpoints: {
        publicKeys: "/api/keys/public",
        keyMetadata: "/api/keys/metadata",
      },
      accessControl: {
        allowedIPs: ["127.0.0.1", "192.168.1.0/24"],
        requireApiKey: true,
        rateLimit: {
          requestsPerMinute: 100,
          burstLimit: 10,
        },
      },
      auditLog: {
        enabled: true,
        logLevel: "info",
        includeClientInfo: true,
      },
    };

    distributionManager = new KeyDistributionManager(mockConfig);

    mockKeyPair = {
      keyId: "test-key-123",
      publicKey: "-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----",
      algorithm: "RS256",
      createdAt: new Date(),
      enabled: true,
    };
  });

  describe("Key Package Creation", () => {
    it("should create key package without private key", async () => {
      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app",
        false
      );

      expect(keyPackage).toBeDefined();
      expect(keyPackage.keyId).toBe("test-key-123");
      expect(keyPackage.appId).toBe("test-app");
      expect(keyPackage.publicKey).toBe(mockKeyPair.publicKey);
      expect(keyPackage.encryptedPrivateKey).toBeUndefined();
      expect(keyPackage.metadata.algorithm).toBe("RS256");
      expect(keyPackage.metadata.fingerprint).toMatch(/^[0-9A-F:]+$/);
      expect(keyPackage.distributedAt).toBeInstanceOf(Date);
    });

    it("should create key package with encrypted private key", async () => {
      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app",
        true
      );

      expect(keyPackage.encryptedPrivateKey).toBeDefined();
      expect(keyPackage.encryptedPrivateKey).not.toBe(mockKeyPair.privateKey);
    });

    it("should include client information when provided", async () => {
      const clientInfo = {
        clientId: "client-123",
        clientIP: "192.168.1.100",
        userAgent: "Test Client/1.0",
      };

      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app",
        false,
        clientInfo
      );

      expect(keyPackage.distributedTo).toEqual(clientInfo);
    });

    it("should throw error when encryption key missing for private key distribution", async () => {
      const configWithoutEncryption = {
        ...mockConfig,
        encryptionKey: undefined,
      };

      const managerWithoutEncryption = new KeyDistributionManager(configWithoutEncryption);

      await expect(
        managerWithoutEncryption.createKeyPackage(mockKeyPair, "test-app", true)
      ).rejects.toThrow("Encryption key not configured");
    });
  });

  describe("Key Distribution", () => {
    let mockRequest: KeyDistributionRequest;

    beforeEach(() => {
      mockRequest = {
        appId: "test-app",
        keyId: "test-key-123",
        includePrivateKey: false,
        clientId: "client-123",
        timestamp: new Date(),
        signature: "mock-signature",
      };

      // Mock console methods to avoid test output
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("should validate distribution request timestamp", async () => {
      const oldRequest = {
        ...mockRequest,
        timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      const response = await distributionManager.distributeKeys(oldRequest);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("VALIDATION_ERROR");
      expect(response.error?.message).toContain("timestamp is too old");
    });

    it("should validate required fields", async () => {
      const invalidRequest = {
        ...mockRequest,
        appId: "",
        clientId: "",
      };

      const response = await distributionManager.distributeKeys(invalidRequest);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("VALIDATION_ERROR");
      expect(response.error?.message).toContain("Missing required fields");
    });

    it("should generate unique request IDs", async () => {
      const response1 = await distributionManager.distributeKeys(mockRequest);
      const response2 = await distributionManager.distributeKeys(mockRequest);

      expect(response1.metadata.requestId).not.toBe(response2.metadata.requestId);
    });

    it("should log distribution requests when audit enabled", async () => {
      await distributionManager.distributeKeys(mockRequest);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("[KeyDistribution] Request:"),
        expect.any(Object)
      );
    });

    it("should log distribution errors when audit enabled", async () => {
      const invalidRequest = {
        ...mockRequest,
        appId: "",
      };

      await distributionManager.distributeKeys(invalidRequest);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[KeyDistribution] Error:"),
        expect.any(Object)
      );
    });
  });

  describe("Public Key Access", () => {
    it("should get public keys for app", async () => {
      const result = await distributionManager.getPublicKeys("test-app");

      expect(result).toBeDefined();
      expect(result.metadata.appId).toBe("test-app");
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
      expect(result.keys).toBeInstanceOf(Array);
    });

    it("should get specific public key", async () => {
      const result = await distributionManager.getPublicKeys("test-app", "test-key-123");

      expect(result.metadata.appId).toBe("test-app");
    });
  });

  describe("Key Distribution Revocation", () => {
    beforeEach(async () => {
      // Create some distribution history
      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app",
        false,
        {
          clientId: "client-123",
          clientIP: "192.168.1.100",
        }
      );

      // Manually add to distribution log for testing
      const history = distributionManager.getDistributionHistory("test-app");
      history.push(keyPackage);
    });

    it("should revoke key distribution for specific client", async () => {
      const result = await distributionManager.revokeKeyDistribution(
        "test-app",
        "test-key-123",
        "client-123"
      );

      expect(result.revoked).toBe(true);
      expect(result.affectedDistributions).toBeGreaterThan(0);
    });

    it("should revoke all distributions for a key", async () => {
      const result = await distributionManager.revokeKeyDistribution(
        "test-app",
        "test-key-123"
      );

      expect(result.revoked).toBe(true);
    });

    it("should return false when no distributions to revoke", async () => {
      const result = await distributionManager.revokeKeyDistribution(
        "test-app",
        "non-existent-key"
      );

      expect(result.revoked).toBe(false);
      expect(result.affectedDistributions).toBe(0);
    });
  });

  describe("Distribution History", () => {
    it("should track distribution history", async () => {
      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app"
      );

      // Simulate recording distribution
      const history = distributionManager.getDistributionHistory("test-app");
      expect(history).toBeInstanceOf(Array);
    });

    it("should filter history by key ID", async () => {
      const history = distributionManager.getDistributionHistory("test-app", "test-key-123");

      expect(history).toBeInstanceOf(Array);
    });

    it("should return empty array for non-existent app", async () => {
      const history = distributionManager.getDistributionHistory("non-existent-app");

      expect(history).toEqual([]);
    });
  });

  describe("Expired Distribution Cleanup", () => {
    it("should cleanup expired distributions", async () => {
      const result = distributionManager.cleanupExpiredDistributions(30);

      expect(result).toBeDefined();
      expect(result.cleaned).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("should use default max age when not specified", async () => {
      const result = distributionManager.cleanupExpiredDistributions();

      expect(result).toBeDefined();
    });
  });

  describe("Private Key Encryption/Decryption", () => {
    it("should encrypt and decrypt private keys", async () => {
      const originalPrivateKey = mockKeyPair.privateKey!;
      const encryptionKey = mockConfig.encryptionKey!;

      // Create key package with encrypted private key
      const keyPackage = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app",
        true
      );

      expect(keyPackage.encryptedPrivateKey).toBeDefined();
      expect(keyPackage.encryptedPrivateKey).not.toBe(originalPrivateKey);

      // Decrypt the private key
      const decryptedPrivateKey = await distributionManager.decryptPrivateKey(
        keyPackage.encryptedPrivateKey!,
        encryptionKey
      );

      expect(decryptedPrivateKey).toBe(originalPrivateKey);
    });

    it("should handle decryption errors", async () => {
      const invalidEncryptedKey = "invalid-encrypted-data";
      const encryptionKey = mockConfig.encryptionKey!;

      await expect(
        distributionManager.decryptPrivateKey(invalidEncryptedKey, encryptionKey)
      ).rejects.toThrow("Failed to decrypt private key");
    });

    it("should handle encryption errors", async () => {
      // Test with invalid encryption key
      const configWithInvalidKey = {
        ...mockConfig,
        encryptionKey: "short", // Too short for AES-256
      };

      const managerWithInvalidKey = new KeyDistributionManager(configWithInvalidKey);

      await expect(
        managerWithInvalidKey.createKeyPackage(mockKeyPair, "test-app", true)
      ).rejects.toThrow("Failed to encrypt private key");
    });
  });

  describe("Key Fingerprint Generation", () => {
    it("should generate consistent fingerprints", async () => {
      const keyPackage1 = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app"
      );

      const keyPackage2 = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app"
      );

      expect(keyPackage1.metadata.fingerprint).toBe(keyPackage2.metadata.fingerprint);
    });

    it("should generate different fingerprints for different keys", async () => {
      const differentKeyPair = {
        ...mockKeyPair,
        publicKey: "-----BEGIN PUBLIC KEY-----\nDIFFERENT_KEY\n-----END PUBLIC KEY-----",
      };

      const keyPackage1 = await distributionManager.createKeyPackage(
        mockKeyPair,
        "test-app"
      );

      const keyPackage2 = await distributionManager.createKeyPackage(
        differentKeyPair,
        "test-app"
      );

      expect(keyPackage1.metadata.fingerprint).not.toBe(keyPackage2.metadata.fingerprint);
    });
  });

  describe("Configuration Validation", () => {
    it("should work with minimal configuration", async () => {
      const minimalConfig: KeyDistributionConfig = {
        accessControl: {},
      };

      const minimalManager = new KeyDistributionManager(minimalConfig);

      const keyPackage = await minimalManager.createKeyPackage(
        mockKeyPair,
        "test-app"
      );

      expect(keyPackage).toBeDefined();
    });

    it("should handle missing audit log configuration", async () => {
      const configWithoutAudit = {
        ...mockConfig,
        auditLog: undefined,
      };

      const managerWithoutAudit = new KeyDistributionManager(configWithoutAudit);

      const mockRequest: KeyDistributionRequest = {
        appId: "test-app",
        clientId: "client-123",
        timestamp: new Date(),
      };

      const response = await managerWithoutAudit.distributeKeys(mockRequest);

      // Should not throw error even without audit config
      expect(response).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle crypto API errors gracefully", async () => {
      // Mock crypto.subtle to throw error
      const originalCrypto = global.crypto;
      
      try {
        // @ts-ignore
        global.crypto = {
          subtle: {
            digest: vi.fn().mockRejectedValue(new Error("Crypto error")),
          },
        };

        await expect(
          distributionManager.createKeyPackage(mockKeyPair, "test-app")
        ).rejects.toThrow("Failed to create key package");
      } finally {
        global.crypto = originalCrypto;
      }
    });

    it("should handle invalid key data", async () => {
      const invalidKeyPair = {
        ...mockKeyPair,
        publicKey: "invalid-key-data",
      };

      await expect(
        distributionManager.createKeyPackage(invalidKeyPair, "test-app")
      ).rejects.toThrow("Failed to create key package");
    });
  });

  describe("Performance", () => {
    it("should handle multiple concurrent distributions", async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        appId: "test-app",
        clientId: `client-${i}`,
        timestamp: new Date(),
      }));

      const promises = requests.map(request =>
        distributionManager.distributeKeys(request)
      );

      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.metadata.requestId).toBeDefined();
      });

      // Ensure all request IDs are unique
      const requestIds = responses.map(r => r.metadata.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(10);
    });
  });
});