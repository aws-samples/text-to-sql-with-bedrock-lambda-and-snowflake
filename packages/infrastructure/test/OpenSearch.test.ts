/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Document } from "@langchain/core/documents";
import { describe, expect, it, vi } from "vitest";
import { OpenSearchApiCalls, waitUntilSearchable } from "../src/runtime/utils/OpenSearch";

/** A fake clock: sleep() advances time instead of waiting. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: vi.fn(async (ms: number) => {
      time += ms;
    }),
  };
}

function fakeAoss(emptySearches: number) {
  let calls = 0;
  const similaritySearch = vi.fn(async () => {
    calls++;
    return calls > emptySearches ? [new Document({ pageContent: "table" })] : [];
  });
  return { aoss: { similaritySearch } as unknown as OpenSearchApiCalls, similaritySearch };
}

describe("waitUntilSearchable", () => {
  it("returns true as soon as a search returns a document", async () => {
    const clock = fakeClock();
    const { aoss, similaritySearch } = fakeAoss(5);
    expect(await waitUntilSearchable(aoss, "probe", clock)).toBe(true);
    expect(similaritySearch).toHaveBeenCalledTimes(6);
    expect(similaritySearch).toHaveBeenCalledWith("probe", 1);
    expect(clock.now()).toBe(50_000);
  });

  it("returns true without sleeping when the index is already searchable", async () => {
    const clock = fakeClock();
    const { aoss } = fakeAoss(0);
    expect(await waitUntilSearchable(aoss, "probe", clock)).toBe(true);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("gives up after the timeout", async () => {
    const clock = fakeClock();
    const { aoss, similaritySearch } = fakeAoss(Number.MAX_SAFE_INTEGER);
    expect(await waitUntilSearchable(aoss, "probe", clock)).toBe(false);
    // Searches at 0s, 10s, ... 120s, never past the 120s default timeout.
    expect(similaritySearch).toHaveBeenCalledTimes(13);
    expect(clock.now()).toBeLessThanOrEqual(120_000);
  });
});
