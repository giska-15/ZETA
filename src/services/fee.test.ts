/**
 * Unit Tests for Zeta Fee Calculator Service
 * Test cases: 11 test cases per requirement
 */

import { describe, it, expect, beforeEach } from "vitest";
import { hitungBiayaLayanan, hitungTotalLengkap } from "./fee";

describe("Fee Calculator Service", () => {
  describe("hitungBiayaLayanan", () => {
    // Test Case 1: Below minimum (999) - should throw
    it("should throw Error for subtotal below minimum (999)", () => {
      expect(() => hitungBiayaLayanan(999)).toThrow("Minimum transaksi Rp1.000");
    });

    // Test Case 2: Minimum valid (1000) - Tier 1 (2%)
    it("should calculate 2% fee for subtotal 1000", () => {
      const result = hitungBiayaLayanan(1000);
      expect(result.subtotal).toBe(1000);
      expect(result.persen).toBe(2);
      expect(result.biaya).toBe(20); // 1000 * 2% = 20
      expect(result.total).toBe(1020); // 1000 + 20
    });

    // Test Case 3: 30000 - Tier 1 (2%)
    it("should calculate 2% fee for subtotal 30000", () => {
      const result = hitungBiayaLayanan(30000);
      expect(result.subtotal).toBe(30000);
      expect(result.persen).toBe(2);
      expect(result.biaya).toBe(600); // 30000 * 2% = 600
      expect(result.total).toBe(30600);
    });

    // Test Case 4: 49999 - Tier 1 (2%)
    it("should calculate 2% fee for subtotal 49999", () => {
      const result = hitungBiayaLayanan(49999);
      expect(result.subtotal).toBe(49999);
      expect(result.persen).toBe(2);
      expect(result.biaya).toBe(1000); // 49999 * 2% = 999.98 -> rounded to 1000
      expect(result.total).toBe(50999);
    });

    // Test Case 5: 50000 - Tier 2 (1.5%)
    it("should calculate 1.5% fee for subtotal 50000", () => {
      const result = hitungBiayaLayanan(50000);
      expect(result.subtotal).toBe(50000);
      expect(result.persen).toBe(1.5);
      expect(result.biaya).toBe(750); // 50000 * 1.5% = 750
      expect(result.total).toBe(50750);
    });

    // Test Case 6: 250000 - Tier 2 (1.5%)
    it("should calculate 1.5% fee for subtotal 250000", () => {
      const result = hitungBiayaLayanan(250000);
      expect(result.subtotal).toBe(250000);
      expect(result.persen).toBe(1.5);
      expect(result.biaya).toBe(3750); // 250000 * 1.5% = 3750
      expect(result.total).toBe(253750);
    });

    // Test Case 7: 499999 - Tier 2 (1.5%)
    it("should calculate 1.5% fee for subtotal 499999", () => {
      const result = hitungBiayaLayanan(499999);
      expect(result.subtotal).toBe(499999);
      expect(result.persen).toBe(1.5);
      expect(result.biaya).toBe(7500); // 499999 * 1.5% = 7499.985 -> rounded to 7500
      expect(result.total).toBe(507499);
    });

    // Test Case 8: 500000 - Tier 3 (1%)
    it("should calculate 1% fee for subtotal 500000", () => {
      const result = hitungBiayaLayanan(500000);
      expect(result.subtotal).toBe(500000);
      expect(result.persen).toBe(1);
      expect(result.biaya).toBe(5000); // 500000 * 1% = 5000
      expect(result.total).toBe(505000);
    });

    // Test Case 9: 999999 - Tier 3 (1%)
    it("should calculate 1% fee for subtotal 999999", () => {
      const result = hitungBiayaLayanan(999999);
      expect(result.subtotal).toBe(999999);
      expect(result.persen).toBe(1);
      expect(result.biaya).toBe(10000); // 999999 * 1% = 9999.99 -> Math.round = 10000
      expect(result.total).toBe(1009999);
    });

    // Test Case 10: 1000000 - Tier 4 (0.75%)
    it("should calculate 0.75% fee for subtotal 1000000", () => {
      const result = hitungBiayaLayanan(1000000);
      expect(result.subtotal).toBe(1000000);
      expect(result.persen).toBe(0.75);
      expect(result.biaya).toBe(7500); // 1000000 * 0.75% = 7500
      expect(result.total).toBe(1007500);
    });

    // Test Case 11: 1500000 - Tier 4 (0.75%)
    it("should calculate 0.75% fee for subtotal 1500000", () => {
      const result = hitungBiayaLayanan(1500000);
      expect(result.subtotal).toBe(1500000);
      expect(result.persen).toBe(0.75);
      expect(result.biaya).toBe(11250); // 1500000 * 0.75% = 11250
      expect(result.total).toBe(1511250);
    });
  });

  describe("hitungTotalLengkap", () => {
    it("should calculate total with shipping cost", () => {
      const result = hitungTotalLengkap(100000, 15000);
      expect(result.subtotal).toBe(100000);
      expect(result.ongkir).toBe(15000);
      expect(result.biaya).toBe(1500); // 100000 * 1.5% = 1500
      expect(result.total).toBe(116500); // 100000 + 15000 + 1500
    });

    it("should calculate total with zero shipping", () => {
      const result = hitungTotalLengkap(50000, 0);
      expect(result.total).toBe(50750); // 50000 + 750
    });
  });

  describe("Edge cases", () => {
    it("should handle exact boundary values correctly", () => {
      // Boundary Tier 1 -> Tier 2
      expect(hitungBiayaLayanan(49999).persen).toBe(2);
      expect(hitungBiayaLayanan(50000).persen).toBe(1.5);
      
      // Boundary Tier 2 -> Tier 3
      expect(hitungBiayaLayanan(499999).persen).toBe(1.5);
      expect(hitungBiayaLayanan(500000).persen).toBe(1);
      
      // Boundary Tier 3 -> Tier 4
      expect(hitungBiayaLayanan(999999).persen).toBe(1);
      expect(hitungBiayaLayanan(1000000).persen).toBe(0.75);
    });

    it("should handle very large amounts", () => {
      const result = hitungBiayaLayanan(10000000); // 10 juta
      expect(result.persen).toBe(0.75);
      expect(result.biaya).toBe(75000);
      expect(result.total).toBe(10075000);
    });
  });
});
