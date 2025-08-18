/**
 * 密钥轮换管理器测试
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyRotationManager, type KeyRotationConfig } from "../../../app/api/auth/key-rotation.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { type KeyManager, type AppConfig, type KeyPair } from "../../../app/api/auth/types.js";

// Mock KeyGenerator
vi.mock("../../../app/api/auth/key-generator.js", () => ({
  KeyGenerator: {
    generateKeyPair: vi.fn().mockResolvedValue({
      keyId: "new-key-123",
      publicKey: "-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----",
      algorithm: "RS256",
      createdAt: new Date(),
      enabled: true,
    }),
    validateKeyPair: vi.fn().mockResolvedValue(true),
  },
}));

describe("KeyRotationManager", () => {
  let keyManager: KeyManager;
  let rotationManager: KeyRotationManager;
  let mockAppConfig: AppConfig;

  beforeEach(() => {
    keyManager = createKeyManager({ storageType: "memory" });
    rotationManager = new KeyRotationManager(keyManager);

    mockAppConfig = {
      appId: "test-app",
      name: "Test App",
      keyPairs: [
        {
          keyId: "old-key-123",
          publicKey: "-----BEGIN PUBLIC KEY-----\nMOCK_OLD_PUBLIC_KEY\n-----END PUBLIC KEY-----",
          algorithm: "RS256",
          createdAt: new Date(Date.now() - 86400000), // 1 day ago
          enabled: true,
        },
      ],
      enabled: true,
      permissions: [],
      createdAt: new Date(),
    };

    // Mock keyManager methods
    vi.spyOn(keyManager, "getAppConfig").mockResolvedValue(mockAppConfig);
    vi.spyOn(keyManager, "getValidKeyPairs").mockResolvedValue(mockAppConfig.keyPairs);
    vi.spyOn(keyManager, "addKeyPair").mockResolvedValue();
    vi.spyOn(keyManager, "updateKeyPair").mockResolvedValue();
    vi.spyOn(keyManager, "setKeyPairEnabled").mockResolvedValue();
    vi.spyOn(keyManager, "removeKeyPair").mockResolvedValue();
    vi.spyOn(keyManager, "listApps").mockResolvedValue(["test-app"]);
  });

  describe("Rotation Plan Creation", () => {
    it("should create rotation plan", async () => {
      const newKeyConfig = {
        algorithm: "RS256" as const,
        options: { expiryDays: 365 },
      };

      const plan = await rotationManager.createRotationPlan(
        "test-app",
        newKeyConfig,
        new Date(),
        "gradual"
      );

      expect(plan).toBeDefined();
      expect(plan.appId).toBe("test-app");
      expect(plan.currentKeyId).toBe("old-key-123");
      expect(plan.newKeyConfig).toEqual(newKeyConfig);
      expect(plan.strategy).toBe("gradual");
    });

    it("should throw error for non-existent app", async () => {
      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue(null);

      await expect(
        rotationManager.createRotationPlan("non-existent-app", {
          algorithm: "RS256",
        })
      ).rejects.toThrow("App non-existent-app not found");
    });

    it("should throw error when no valid keys exist", async () => {
      vi.spyOn(keyManager, "getValidKeyPairs").mockResolvedValue([]);

      await expect(
        rotationManager.createRotationPlan("test-app", {
          algorithm: "RS256",
        })
      ).rejects.toThrow("No valid keys found for app test-app");
    });
  });

  describe("Key Rotation Execution", () => {
    beforeEach(async () => {
      // Create a rotation plan first
      await rotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
        options: { expiryDays: 365 },
      });
    });

    it("should execute immediate rotation", async () => {
      const result = await rotationManager.executeRotation("test-app");

      expect(result).toBeDefined();
      expect(result.oldKeyId).toBe("old-key-123");
      expect(result.newKeyId).toBe("new-key-123");
      expect(result.rotationTime).toBeInstanceOf(Date);

      // Verify old key was disabled and new key was added
      expect(keyManager.setKeyPairEnabled).toHaveBeenCalledWith("test-app", "old-key-123", false);
      expect(keyManager.addKeyPair).toHaveBeenCalled();
    });

    it("should execute gradual rotation", async () => {
      // Create gradual rotation plan
      await rotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
      }, new Date(), "gradual");

      const result = await rotationManager.executeRotation("test-app");

      expect(result.oldKeyId).toBe("old-key-123");
      expect(result.newKeyId).toBe("new-key-123");

      // Verify new key was added and old key expiry was set
      expect(keyManager.addKeyPair).toHaveBeenCalled();
      expect(keyManager.updateKeyPair).toHaveBeenCalledWith(
        "test-app",
        "old-key-123",
        expect.objectContaining({ expiresAt: expect.any(Date) })
      );
    });

    it("should execute scheduled rotation", async () => {
      // Create scheduled rotation plan
      await rotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
      }, new Date(), "scheduled");

      const result = await rotationManager.executeRotation("test-app");

      expect(result.oldKeyId).toBe("old-key-123");
      expect(result.newKeyId).toBe("new-key-123");

      // Verify new key was added but disabled
      expect(keyManager.addKeyPair).toHaveBeenCalledWith(
        "test-app",
        expect.objectContaining({ enabled: false })
      );
    });

    it("should call rotation callbacks", async () => {
      const onRotationComplete = vi.fn();
      const rotationManagerWithCallbacks = new KeyRotationManager(keyManager, {
        onRotationComplete,
      });

      // Create rotation plan
      await rotationManagerWithCallbacks.createRotationPlan("test-app", {
        algorithm: "RS256",
      });

      await rotationManagerWithCallbacks.executeRotation("test-app");

      expect(onRotationComplete).toHaveBeenCalledWith("test-app", "old-key-123", "new-key-123");
    });

    it("should handle rotation errors", async () => {
      const onRotationError = vi.fn();
      const rotationManagerWithCallbacks = new KeyRotationManager(keyManager, {
        onRotationError,
      });

      // Mock key generation failure
      const { KeyGenerator } = await import("../../../app/api/auth/key-generator.js");
      vi.mocked(KeyGenerator.generateKeyPair).mockRejectedValue(new Error("Key generation failed"));

      // Create rotation plan
      await rotationManagerWithCallbacks.createRotationPlan("test-app", {
        algorithm: "RS256",
      });

      await expect(
        rotationManagerWithCallbacks.executeRotation("test-app")
      ).rejects.toThrow("Key generation failed");

      expect(onRotationError).toHaveBeenCalledWith("test-app", expect.any(Error));
    });
  });

  describe("Batch Rotation", () => {
    it("should rotate multiple keys", async () => {
      const rotations = [
        {
          appId: "test-app",
          newKeyConfig: { algorithm: "RS256" as const },
        },
        {
          appId: "test-app",
          keyId: "old-key-123",
          newKeyConfig: { algorithm: "ES256" as const },
          strategy: "immediate" as const,
        },
      ];

      const results = await rotationManager.batchRotateKeys(rotations);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].appId).toBe("test-app");
      expect(results[1].success).toBe(true);
      expect(results[1].appId).toBe("test-app");
    });

    it("should handle partial failures in batch rotation", async () => {
      // Mock one failure
      vi.spyOn(keyManager, "getAppConfig")
        .mockResolvedValueOnce(mockAppConfig)
        .mockResolvedValueOnce(null); // Second call returns null

      const rotations = [
        {
          appId: "test-app",
          newKeyConfig: { algorithm: "RS256" as const },
        },
        {
          appId: "non-existent-app",
          newKeyConfig: { algorithm: "ES256" as const },
        },
      ];

      const results = await rotationManager.batchRotateKeys(rotations);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("not found");
    });
  });

  describe("Key Status Management", () => {
    it("should get key status for active key", async () => {
      const status = await rotationManager.getKeyStatus("test-app", "old-key-123");

      expect(status).toBeDefined();
      expect(status.keyId).toBe("old-key-123");
      expect(status.appId).toBe("test-app");
      expect(status.status).toBe("active");
      expect(status.health).toBe("healthy");
    });

    it("should detect expired keys", async () => {
      const expiredKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        expiresAt: new Date(Date.now() - 86400000), // Expired 1 day ago
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [expiredKeyPair],
      });

      const status = await rotationManager.getKeyStatus("test-app", "old-key-123");

      expect(status.status).toBe("expired");
      expect(status.health).toBe("critical");
      expect(status.healthMessage).toContain("expired");
    });

    it("should detect keys nearing expiry", async () => {
      const nearExpiryKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Expires in 5 days
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [nearExpiryKeyPair],
      });

      const status = await rotationManager.getKeyStatus("test-app", "old-key-123");

      expect(status.status).toBe("active");
      expect(status.health).toBe("critical");
      expect(status.healthMessage).toContain("expires in 5 days");
    });

    it("should detect disabled keys", async () => {
      const disabledKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        enabled: false,
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [disabledKeyPair],
      });

      const status = await rotationManager.getKeyStatus("test-app", "old-key-123");

      expect(status.status).toBe("disabled");
      expect(status.health).toBe("critical");
      expect(status.healthMessage).toBe("Key is disabled");
    });

    it("should get all key statuses for an app", async () => {
      const multiKeyConfig: AppConfig = {
        ...mockAppConfig,
        keyPairs: [
          mockAppConfig.keyPairs[0],
          {
            keyId: "key-2",
            publicKey: "-----BEGIN PUBLIC KEY-----\nKEY2\n-----END PUBLIC KEY-----",
            algorithm: "ES256",
            createdAt: new Date(),
            enabled: false,
          },
        ],
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue(multiKeyConfig);

      const statuses = await rotationManager.getAppKeyStatuses("test-app");

      expect(statuses).toHaveLength(2);
      expect(statuses[0].keyId).toBe("old-key-123");
      expect(statuses[1].keyId).toBe("key-2");
      expect(statuses[1].status).toBe("disabled");
    });
  });

  describe("Expired Key Cleanup", () => {
    it("should cleanup expired keys", async () => {
      const expiredKeyPair: KeyPair = {
        keyId: "expired-key",
        publicKey: "-----BEGIN PUBLIC KEY-----\nEXPIRED\n-----END PUBLIC KEY-----",
        algorithm: "RS256",
        createdAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        enabled: true,
      };

      const configWithExpiredKey: AppConfig = {
        ...mockAppConfig,
        keyPairs: [mockAppConfig.keyPairs[0], expiredKeyPair],
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue(configWithExpiredKey);
      vi.spyOn(keyManager, "removeKeyPair").mockResolvedValue();

      const result = await rotationManager.cleanupExpiredKeys("test-app");

      expect(result.cleaned).toHaveLength(1);
      expect(result.cleaned[0].keyId).toBe("expired-key");
      expect(result.errors).toHaveLength(0);

      expect(keyManager.removeKeyPair).toHaveBeenCalledWith("test-app", "expired-key");
    });

    it("should disable last expired key instead of removing", async () => {
      const expiredKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [expiredKeyPair], // Only one key
      });

      vi.spyOn(keyManager, "setKeyPairEnabled").mockResolvedValue();

      const result = await rotationManager.cleanupExpiredKeys("test-app");

      expect(result.cleaned).toHaveLength(1);
      expect(keyManager.setKeyPairEnabled).toHaveBeenCalledWith("test-app", "old-key-123", false);
      expect(keyManager.removeKeyPair).not.toHaveBeenCalled();
    });

    it("should handle cleanup errors", async () => {
      vi.spyOn(keyManager, "removeKeyPair").mockRejectedValue(new Error("Removal failed"));

      const expiredKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        expiresAt: new Date(Date.now() - 3600000),
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [mockAppConfig.keyPairs[0], expiredKeyPair],
      });

      const result = await rotationManager.cleanupExpiredKeys("test-app");

      expect(result.cleaned).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("Removal failed");
    });
  });

  describe("Maintenance Operations", () => {
    it("should perform comprehensive maintenance", async () => {
      const result = await rotationManager.performMaintenance();

      expect(result).toBeDefined();
      expect(result.cleanupResult).toBeDefined();
      expect(result.healthChecks).toBeDefined();
    });

    it("should identify unhealthy keys during maintenance", async () => {
      const warningKeyPair: KeyPair = {
        ...mockAppConfig.keyPairs[0],
        expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // Expires in 20 days
      };

      vi.spyOn(keyManager, "getAppConfig").mockResolvedValue({
        ...mockAppConfig,
        keyPairs: [warningKeyPair],
      });

      const result = await rotationManager.performMaintenance();

      expect(result.healthChecks.length).toBeGreaterThan(0);
      expect(result.healthChecks[0].health).toBe("warning");
    });
  });

  describe("Rotation Plan Management", () => {
    it("should list rotation plans", async () => {
      await rotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
      });

      const plans = rotationManager.getRotationPlans();

      expect(plans).toHaveLength(1);
      expect(plans[0].appId).toBe("test-app");
    });

    it("should cancel rotation plans", async () => {
      await rotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
      });

      const cancelled = rotationManager.cancelRotationPlan("test-app", "old-key-123");

      expect(cancelled).toBe(true);

      const plans = rotationManager.getRotationPlans();
      expect(plans).toHaveLength(0);
    });

    it("should return false when cancelling non-existent plan", async () => {
      const cancelled = rotationManager.cancelRotationPlan("non-existent-app", "non-existent-key");

      expect(cancelled).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should use custom configuration", async () => {
      const customConfig: KeyRotationConfig = {
        strategy: "immediate",
        gracePeriodDays: 60,
        autoDisableExpired: false,
      };

      const customRotationManager = new KeyRotationManager(keyManager, customConfig);

      await customRotationManager.createRotationPlan("test-app", {
        algorithm: "RS256",
      });

      const plans = customRotationManager.getRotationPlans();
      expect(plans[0].strategy).toBe("immediate");
    });
  });
});