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

import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { describe, expect, it } from "vitest";
import { OpenSearchServerlessVectorStore } from "../src/constructs/OpenSearchServerlessVectorStore";

function networkPolicy(stack: Stack): any[] {
  const policies = Template.fromStack(stack).findResources("AWS::OpenSearchServerless::SecurityPolicy", {
    Properties: { Type: "network" },
  });
  const [policy] = Object.values(policies);
  // Without a VPC endpoint the policy has no tokens, so it synthesizes to a plain JSON string.
  return JSON.parse(policy.Properties.Policy);
}

function stackWithVpc() {
  const stack = new Stack(new App(), "Test");
  const vpc = new Vpc(stack, "Vpc", { subnetConfiguration: [{ name: "isolated", subnetType: SubnetType.PRIVATE_ISOLATED }] });
  return { stack, vpc };
}

describe("OpenSearchServerlessVectorStore network policy", () => {
  it("allows public access by default", () => {
    const stack = new Stack(new App(), "Test");
    new OpenSearchServerlessVectorStore(stack, "Store", { name: "test", description: "test" });
    const rules = networkPolicy(stack);
    expect(rules).toHaveLength(1);
    expect(rules[0].AllowFromPublic).toBe(true);
  });

  it("allows only the VPC endpoint when allowPublicAccess is false", () => {
    const { stack, vpc } = stackWithVpc();
    new OpenSearchServerlessVectorStore(stack, "Store", { name: "test", description: "test", vpc, allowPublicAccess: false });
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::OpenSearchServerless::VpcEndpoint", 1);
    const policy = Object.values(template.findResources("AWS::OpenSearchServerless::SecurityPolicy", { Properties: { Type: "network" } }))[0];
    // The policy embeds the VPC endpoint id, so it is an Fn::Join. No rule may allow public access.
    const serialized = JSON.stringify(policy.Properties.Policy);
    expect(serialized).not.toContain('\\"AllowFromPublic\\":true');
    expect(serialized).toContain('\\"AllowFromPublic\\":false');
  });

  it("rejects allowPublicAccess: false without a VPC", () => {
    const stack = new Stack(new App(), "Test");
    new OpenSearchServerlessVectorStore(stack, "Store", { name: "test", description: "test", allowPublicAccess: false });
    expect(() => Template.fromStack(stack)).toThrow(/requires a vpc/);
  });
});
