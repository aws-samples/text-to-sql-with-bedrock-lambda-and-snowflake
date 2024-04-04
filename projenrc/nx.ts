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

import {Component, JsonFile, typescript} from 'projen';

// Custom projen component that configures nx.


export class Nx extends Component {
	constructor(rootProject: typescript.TypeScriptProject) {
		super(rootProject);

		// Add nx library dependencies
		rootProject.addDevDeps(
			'nx@^15',
			'@nrwl/devkit@^15',
			'@nrwl/workspace@^15'
		);

		// Add nx.json file
		new JsonFile(rootProject, 'nx.json', {
			obj: {
				extends: 'nx/presets/npm.json',
				tasksRunnerOptions: {
					default: {
						runner: '@nrwl/workspace/tasks-runners/default',
						options: {

							// By default nx uses a local cache to prevent re-running targets

							// that have not had their inputs changed (eg. no changes to source files).
							// The following specifies what targets are cacheable.
							cacheableOperations: ['build']
						},
					},
				},
				targetDefaults: {
					build: {

						// Specifies the build target of a project is dependent on the
						// build target of dependant projects (via the caret)
						dependsOn: ['^build'],

						// Inputs tell nx which files can invalidate the cache should they updated.
						// We only want the build target cache to be invalidated if there
						// are changes to source files so the config below ignores output files.
						inputs: [
							'!{projectRoot}/test-reports/**/*',
							'!{projectRoot}/coverage/**/*',
							'!{projectRoot}/build/**/*',
							'!{projectRoot}/dist/**/*',
							'!{projectRoot}/lib/**/*',
							'!{projectRoot}/cdk.out/**/*'
						],

						// Outputs tell nx where artifacts can be found for caching purposes.
						// The need for this will become more obvious when we configure

						// github action workflows and need to restore the nx cache for

						// subsequent job to fetch artifacts
						outputs: [
							'{projectRoot}/dist',
							'{projectRoot}/lib',
							'{projectRoot}/cdk.out'
						]
					},
					deploy: {dependsOn: ['build']}
				},

				// This is used when running 'nx affected ….' command to selectively
				// run targets against only those packages that have changed since
				// lastest commit on origin/main
				affected: {defaultBase: 'origin/main'},
			},
		});
	}
}