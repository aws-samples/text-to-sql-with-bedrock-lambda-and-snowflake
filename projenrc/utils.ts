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

import { NodeProject } from "projen/lib/javascript";
//@ts-ignore
import { Link, Node } from "@npmcli/arborist";
import * as fs from "fs";
import { TaskStep } from "projen/lib/task-model";
import { TypeScriptProject } from "projen/lib/typescript";

const Arborist = require("@npmcli/arborist");

/**
 * This function walks the package.json for the project and zips all production dependencies for use in a lambda layer
 * @param p
 * @param exclude
 * @param addSteps - function that can be used to inject steps into the zip-runtime task
 */
//@ts-ignore
export async function zipRuntime(p: NodeProject, exclude: string[] = [], addSteps: (p: NodeProject, esBuildExternal: string) => TaskStep[]) {
  const steps: TaskStep[] = [

    {
      exec: "rm -Rf ./dist"

    },
    {
      exec: `rm -Rf /tmp/${p.name}`
    },
    {
      exec: `mkdir -p /tmp/${p.name}/nodejs/node_modules/${p.package.packageName}`
    }
  ];

  const a = new Arborist({ path: p.outdir });
  const depNames: string[] = [];

  const excludeDeps = (depName: string) => {
    for (const ex of exclude) {
      if (depName.startsWith(ex)) {
        return true;
      }
    }
    return false;
  };
  let esBuildExternal: string = "";
  const recursivelyGetDependencies = (node: Node | Link) => {
    if (node.package.dependencies != undefined) {
      for (const depName of Object.keys(node.package.dependencies)) {
        if (depNames.indexOf(depName) == -1) {
          let d = node.children.get(depName);
          if (d == undefined) {
            d = node.root.inventory.get(`node_modules/${depName}`);
          }
          if (d != undefined && !d.dev) {
            if (!excludeDeps(d.name)) {
              // const relativePath = path.relative(p.outdir, d.path);
              if (fs.existsSync(d.path)) {
                steps.push({
                  exec: `mkdir -p /tmp/${p.name}/nodejs/node_modules/${depName}`
                });
                steps.push({
                  exec: `cp -R ${d.path}/* /tmp/${p.name}/nodejs/node_modules/${depName}`
                });
              }
              recursivelyGetDependencies(d);
            } else {
              esBuildExternal += ` --external:${d.name}`;
            }
          }
          depNames.push(depName);
        }
      }
    }
  };
  //@ts-ignore
  const tree = await a.loadActual();
  recursivelyGetDependencies(tree);
  addSteps(p, esBuildExternal).forEach(step => steps.push(step));

  p.addTask("zip-runtime", {
    cwd: p.outdir,
    steps: steps
  });

  p.tasks.tryFind("compile")?.exec("npm run zip-runtime");
}

export function zipLambdaFunction(filePath: string, esBuildExternal: string): TaskStep[] {
  const steps: TaskStep[] = [];
  const regex = new RegExp(/src\/(.*)\/(.*)\.ts/);
  const match = regex.exec(filePath);

  if (match) {
    const filename = match[2] as string;
    steps.push({
      exec: `esbuild ${filePath} --platform=node  --bundle ${esBuildExternal}  --outfile=lib/runtime/esbuild/${filename}/index.js`
    });
    steps.push({
      exec: `zip -j -r ./dist/${filename}.zip lib/runtime/esbuild/${filename}/index.js`
    });
  }
  return steps;
}

export function overrideFormatting(p: TypeScriptProject) {
  p.eslint?.addOverride({
    files: ["*"],
    rules: {
      "max-len": ["error",
        {
          code: 180,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreComments: true,
          ignoreRegExpLiterals: true
        }]

    }
  });
  const t = p.tasks.addTask("prettier", {
    receiveArgs: true,
    exec: `prettier  --config ${p.parent?.outdir}/.prettierrc.json --no-error-on-unmatched-pattern --write 'src/**/*.{ts,js,json,jsx}' 'src/*.{ts,js,json,jsx}'`
  });
  p.tasks.tryFind("eslint")?.spawn(t);
}