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

import {javascript} from "projen";


import {TypeScriptProject} from "projen/lib/typescript";
// @ts-ignore
import {PnpmWorkspace} from "./projenrc/pnpm";
// @ts-ignore
import {Nx} from "./projenrc/nx";

// @ts-ignore
import {overrideFormatting, zipLambdaFunction, zipRuntime} from "./projenrc/utils";
import {ReleaseTrigger} from "projen/lib/release";
import {NodeProject, TypeScriptModuleResolution} from "projen/lib/javascript";
import {ApprovalLevel, AwsCdkTypeScriptApp} from "projen/lib/awscdk";
import {execSync} from "child_process";
import {TaskStep} from "projen/lib/task-model";


const defaultReleaseBranch = "main";

const cdkVersion = `${execSync("npm show 'aws-cdk-lib' version")}`.trim();
const nodeVersion = "20.11.1";
const pnpmVersion = "8.15.3";
const jsiiReleaseVersion = "1.94.0";
const namespace = "@text-to-sql-with-athena-and-snowflake";
const main = async () => {
	const root = new TypeScriptProject({
		name: `${namespace}/root`,
		defaultReleaseBranch,
		packageManager: javascript.NodePackageManager.PNPM,
		projenCommand: "pnpm dlx projen",
		minNodeVersion: nodeVersion,
		projenrcTs: true,
		sampleCode: false,
		license: "MIT-0",
		copyrightOwner: "Amazon.com, Inc. or its affiliates. All Rights Reserved.",
		tsconfig: {
			compilerOptions: {
				target: "ES2022",
				lib: ["ES2022"]
			},
			include: ["projen/**/*.ts"]
		},
		gitignore: [".DS_Store", ".idea", "*.iml", ".$*", "appsec"],
		// Jest and eslint are disabled at the root as they will be
		// configured by each subproject. Using a single jest/eslint
		// config at the root is out of scope for this walkthrough
		eslint: false,
		jest: false,

		// Disable default github actions workflows generated
		// by projen as we will generate our own later (that uses nx)
		depsUpgradeOptions: {workflow: false},
		buildWorkflow: false,
		release: false,
		devDeps: [
			"@npmcli/arborist",
			"@types/npm-packlist",
			"@types/npmcli__arborist",
			"prettier"
		]
	});
	const infrastructure = new AwsCdkTypeScriptApp({
		name: `infrastructure`,
		packageName: `${namespace}/infrastructure`,
		jsiiReleaseVersion,
		outdir: "./packages/infrastructure",
		parent: root,
		cdkVersion,
		defaultReleaseBranch,

		packageManager: root.package.packageManager,
		projenCommand: root.projenCommand,
		minNodeVersion: root.minNodeVersion,
		projenrcTs: true,
		sampleCode: false,
		licensed: false,
		jest: false,
		github: false,
		eslint: true,
		requireApproval: ApprovalLevel.NEVER,
		appEntrypoint: "main.ts",
		tsconfig: {
			compilerOptions: {
				target: "ESNext",
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				moduleResolution: TypeScriptModuleResolution.BUNDLER,
				strict: true,
				noEmit: true,
				isolatedModules: true
			}

		},

		eslintOptions: {

			dirs: ["src/runtime"],
			devdirs: ["test"],
			ignorePatterns: ["test/*"]
		},
		releaseTrigger: ReleaseTrigger.manual({}),
		majorVersion: 0,
		deps: [] /* Runtime dependencies of this module. */,
		// description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
		devDeps: [
			"aws-cdk-lib",
			"cdk-assets",
			"cdk-nag",
			"sinon",
			"@types/sinon",
			"vitest"
		]
	});
	new PnpmWorkspace(root);
	new Nx(root); // add nx to root
	root.package.addField("packageManager", `pnpm@${pnpmVersion}`);
	root.npmrc.addConfig("auto-install-peers", "true");
	root.tasks.addTask("nx", {
		receiveArgs: true
	});
	root.tasks.addTask("deploy", {
		receiveArgs: true
	});
	root.tasks.addTask("destroy", {
		receiveArgs: true
	});
	root.tasks.addTask("prettier", {
		receiveArgs: true
	});
	overrideFormatting(infrastructure);

	[infrastructure].forEach(value => {


		root.tasks.tryFind("nx")?.exec(`nx build ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("prettier")?.exec(`nx prettier ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("deploy")?.exec(`nx deploy ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("destroy")?.exec(`nx destroy ${value.package.packageName}`, {
			receiveArgs: true
		});
	});
	await zipRuntime(infrastructure, [
		namespace,
		"@aws-lambda-powertools",
		"@aws-sdk",
		"@smithy",
		"@types",
		"constructs"], (p: NodeProject, _esBuildExternal: string) => {
		const steps: TaskStep[] = [
			{
				exec: "rm -Rf ./lib/runtime",
				cwd: p.outdir
			},
			{
				exec: "rm -Rf ./dist",
				cwd: p.outdir
			},
			{
				exec: "mkdir ./dist",
				cwd: p.outdir
			},
		];
		return steps;
	});
	root.synth();
};

main().then(() => {

}).catch(reason => {
	throw new Error(reason);
});