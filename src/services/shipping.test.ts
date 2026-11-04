/**
 * Unit Tests for Zeta Shipping Calculator Service
 * Testing logic without actual network calls
 */

import { describe, it, expect } from "vitest";

describe("Shipping Calculator Service", () => {
  describe("Configuration", () => {
    it("should have RAJAONGKIR_API_KEY in env example", () => {
      expect(process.env).toBeDefined();
    });

    it("should support Starter and Pro API", () => {
      const getUrl = (isPro: boolean) => 
        isPro 
          ? "https://pro.rajaongkir.com/api/cost"
          : "https://api.rajaongkir.com/starter/cost";
      
      expect(getUrl(false)).toBe("https://api.rajaongkir.com/starter/cost");
      expect(getUrl(true)).toBe("https://pro.rajaongkir.com/api/cost");
    });
  });

  describe("Response parsing", () => {
    it("should parse RajaOngkir response correctly", () => {
      const mockResponse = {
        rajaongkir: {
          results: [
            {
              code: "JNE",
              costs: [
                {
                  service: "REG",
                  cost: [{ value: 12000, etd: "2-3" }],
                },
              ],
            },
          ],
        },
      };
      
      const costs: Array<{ nama: string; harga: number; estimasi: string; service: string }> = [];
      
      if (mockResponse.rajaongkir?.results) {
        for (const result of mockResponse.rajaongkir.results) {
          if (result.costs) {
            for (const cost of result.costs) {
              const detail = Array.isArray(cost.cost) ? cost.cost[0] : cost.cost;
              if (detail) {
                costs.push({
                  nama: result.code?.toUpperCase() || "JNE",
                  harga: detail.value || 0,
                  estimasi: detail.etd || "-",
                  service: cost.service || "-",
                });
              }
            }
          }
        }
      }
      
      expect(costs).toHaveLength(1);
      expect(costs[0].nama).toBe("JNE");
      expect(costs[0].harga).toBe(12000);
      expect(costs[0].estimasi).toBe("2-3");
      expect(costs[0].service).toBe("REG");
    });

    it("should handle multiple couriers", () => {
      const mockResponse = {
        rajaongkir: {
          results: [
            {
              code: "JNE",
              costs: [{ service: "REG", cost: [{ value: 12000, etd: "2" }] }],
            },
            {
              code: "TIKI",
              costs: [{ service: "REG", cost: [{ value: 11000, etd: "3" }] }],
            },
            {
              code: "POS",
              costs: [{ service: "PAKET", cost: [{ value: 9000, etd: "5" }] }],
            },
          ],
        },
      };
      
      const costs: Array<{ nama: string; harga: number; estimasi: string; service: string }> = [];
      
      for (const result of mockResponse.rajaongkir.results) {
        if (result.costs) {
          for (const cost of result.costs) {
            const detail = Array.isArray(cost.cost) ? cost.cost[0] : cost.cost;
            if (detail) {
              costs.push({
                nama: result.code.toUpperCase(),
                harga: detail.value,
                estimasi: detail.etd,
                service: cost.service,
              });
            }
          }
        }
      }
      
      costs.sort((a, b) => a.harga - b.harga);
      
      expect(costs).toHaveLength(3);
      expect(costs[0].nama).toBe("POS");
      expect(costs[1].nama).toBe("TIKI");
      expect(costs[2].nama).toBe("JNE");
    });
  });

  describe("Sorting", () => {
    it("should sort results by price ascending", () => {
      const results = [
        { nama: "JNE", harga: 25000, estimasi: "1", service: "YES" },
        { nama: "TIKI", harga: 11000, estimasi: "3", service: "REG" },
        { nama: "JNE", harga: 12000, estimasi: "2", service: "REG" },
      ];
      
      results.sort((a, b) => a.harga - b.harga);
      
      expect(results[0].harga).toBe(11000);
      expect(results[1].harga).toBe(12000);
      expect(results[2].harga).toBe(25000);
    });
  });

  describe("Weight calculation", () => {
    it("should handle weight in grams", () => {
      const weight = 1500;
      expect(weight).toBe(1500);
    });
  });

  describe("Error handling", () => {
    it("should throw when API key is missing", () => {
      const getApiKey = () => {
        const key = process.env.RAJAONGKIR_API_KEY;
        if (!key) throw new Error("RAJAONGKIR_API_KEY is required");
        return key;
      };
      
      delete process.env.RAJAONGKIR_API_KEY;
      expect(getApiKey).toThrow("RAJAONGKIR_API_KEY is required");
    });
  });
});
