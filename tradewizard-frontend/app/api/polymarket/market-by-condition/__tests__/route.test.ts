import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

// Mock the fetch function
global.fetch = vi.fn();

describe("GET /api/polymarket/market-by-condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if conditionId is missing", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/polymarket/market-by-condition")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("conditionId parameter is required");
  });

  it("should fetch market details from CLOB API successfully", async () => {
    const mockMarket = {
      condition_id: "0x123abc",
      market_slug: "will-trump-win-2024",
      question: "Will Trump win 2024?",
      outcomes: ["Yes", "No"],
      clob_token_ids: ["token1", "token2"],
      end_date_iso: "2024-11-05T00:00:00Z",
      image: "https://example.com/image.jpg",
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarket,
    });

    const request = new NextRequest(
      new URL(
        "http://localhost:3000/api/polymarket/market-by-condition?conditionId=0x123abc"
      )
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockMarket);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://clob.polymarket.com/markets/0x123abc",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
  });

  it("should return 404 if market not found", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const request = new NextRequest(
      new URL(
        "http://localhost:3000/api/polymarket/market-by-condition?conditionId=0xnonexistent"
      )
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Market not found");
  });

  it("should handle CLOB API errors gracefully", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const request = new NextRequest(
      new URL(
        "http://localhost:3000/api/polymarket/market-by-condition?conditionId=0x123abc"
      )
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to fetch market by condition ID");
  });
});
