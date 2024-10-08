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

import { CfnAccessPolicy, CfnCollection, CfnSecurityPolicy, CfnVpcEndpoint } from "aws-cdk-lib/aws-opensearchserverless";
import { Construct, Dependable, IDependable } from "constructs";
import { paramCase } from "change-case";
import { IRole } from "aws-cdk-lib/aws-iam";
import { IVpc, SecurityGroup, SubnetSelection } from "aws-cdk-lib/aws-ec2";

export interface ResourceRule {
  ResourceType: string;
  Resource: string[];
}

export interface AccessPolicyResourceRule extends ResourceRule {
  Permission: string[];
}

export interface EncryptionPolicy {
  Rules: ResourceRule[];
  AWSOwnedKey: boolean;
}

export interface NetworkPolicy {
  Description: string;
  Rules: ResourceRule[];
  AllowFromPublic: boolean;
}

export interface AccessPolicy {
  Description: string;
  Rules: AccessPolicyResourceRule[];
  Principal: string[];
}

export interface OpenSearchServerlessVectorStoreConfig {
  name: string;
  description: string;
  vpc?: IVpc;
  subnets?: SubnetSelection;
  securityGroups?: SecurityGroup[];
}

export class OpenSearchServerlessVectorStore extends Construct implements IDependable {
  readonly collection: CfnCollection;

  constructor(scope: Construct, id: string, config: OpenSearchServerlessVectorStoreConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        return messages;
      },
    });
    this.collection = new CfnCollection(this, "Collection", {
      name: config.name,
      description: config.description,
      type: "VECTORSEARCH",
    });

    const encryptionPolicy: EncryptionPolicy = {
      Rules: [
        {
          ResourceType: "collection",
          Resource: [`collection/${this.collection.name}`],
        },
      ],
      AWSOwnedKey: true,
    };
    const networkPolicies: NetworkPolicy[] = [
      {
        Description: "Public access",
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${this.collection.name}`],
          },
          {
            ResourceType: "dashboard",
            Resource: [`collection/${this.collection.name}`],
          },
        ],
        AllowFromPublic: true,
      },
    ];

    if (config.vpc != undefined) {
      const vpce = new CfnVpcEndpoint(this, "AossVpce", {
        name: `${config.name}-vpce`,
        vpcId: config.vpc.vpcId,
        subnetIds: config.vpc.selectSubnets(config.subnets).subnetIds,
        securityGroupIds: config.securityGroups?.map((value) => {
          return value.securityGroupId;
        }),
      });
      const vpcePolicy = {
        Description: "VPCE",
        AllowFromPublic: false,
        SourceVPCEs: [vpce.ref],
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${this.collection.name}`],
          },
          {
            ResourceType: "dashboard",
            Resource: [`collection/${this.collection.name}`],
          },
        ],
      };
      networkPolicies.push(vpcePolicy);
    }
    const cfnEncryptionPolicy = new CfnSecurityPolicy(this, "SecurityPolicy", {
      name: `${paramCase(config.name)}-security-policy`,
      type: "encryption",
      policy: JSON.stringify(encryptionPolicy),
    });

    const cfnNetworkPolicy = new CfnSecurityPolicy(this, "NetworkPolicy", {
      name: `${paramCase(config.name)}-network-policy`,
      type: "network",
      policy: JSON.stringify(networkPolicies),
    });

    this.collection.addDependency(cfnEncryptionPolicy);
    this.collection.addDependency(cfnNetworkPolicy);
  }

  grantFullDataAccess(policyName: string, role: IRole) {
    const policies: AccessPolicy[] = [
      {
        Description: "Grants data access to the role",
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${this.collection.name}`],
            Permission: ["aoss:CreateCollectionItems", "aoss:DeleteCollectionItems", "aoss:UpdateCollectionItems", "aoss:DescribeCollectionItems"],
          },
          {
            ResourceType: "index",
            Resource: [`index/${this.collection.name}/*`],
            Permission: ["aoss:CreateIndex", "aoss:DeleteIndex", "aoss:UpdateIndex", "aoss:DescribeIndex", "aoss:ReadDocument", "aoss:WriteDocument"],
          },
        ],
        Principal: [role.roleArn],
      },
    ];

    new CfnAccessPolicy(this, policyName, {
      name: policyName,
      description: `Grants data access to the ${role.roleName}`,
      type: "data",
      policy: JSON.stringify(policies),
    });
  }

  get name(): string {
    return this.collection.name;
  }
}
