"use client";


import { useState } from "react";

// Debug component to test public prices API
export default function PublicPricesTest() {
  const [testResult, setTestResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const testPublicPricesAPI = async () => {
    setIsLoading(true);
    setTestResult("");

    try {
      // Test with a few sample token IDs
      const sampleTokenIds = [
        "21742633143463906290569050155826241533067272736897614950488156847949938836455",
        "78541154740101398236676481930914671589944401619394760971738347317792414417404"
      ];

      console.log("Testing public prices API with tokens:", sampleTokenIds);

      const response = await fetch("/api/polymarket/public-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tokenIds: sampleTokenIds }),
      });

      console.log("API Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        setTestResult(`API Error: ${response.status} - ${errorText}`);
        return;
      }

      const data = await response.json();
      console.log("API Response data:", data);

      setTestResult(`Success! Fetched prices for ${Object.keys(data).length} tokens:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      console.error("Test error:", error);
      setTestResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Public Prices API Test</h3>
      
      <button
        onClick={testPublicPricesAPI}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Testing..." : "Test Public Prices API"}
      </button>

      {testResult && (
        <div className="mt-4 p-3 bg-gray-900 rounded text-sm">
          <pre className="whitespace-pre-wrap">{testResult}</pre>
        </div>
      )}
    </div>
  );
}