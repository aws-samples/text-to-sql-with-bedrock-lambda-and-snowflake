import { CfnAccessPolicy, CfnCollection, CfnSecurityPolicy } from "aws-cdk-lib/aws-opensearchserverless";
import { Construct, Dependable, IDependable } from "constructs";
import { paramCase } from "change-case";
import { IRole } from "aws-cdk-lib/aws-iam";

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

export class OpenSearchServerlessVectorStore extends Construct implements IDependable {
  readonly collection: CfnCollection;

  constructor(scope: Construct, id: string, name: string, description: string) {
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
      name: name,
      description: description,
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

    const cfnEncryptionPolicy = new CfnSecurityPolicy(this, "SecurityPolicy", {
      name: `${paramCase(name)}-security-policy`,
      type: "encryption",
      policy: JSON.stringify(encryptionPolicy),
    });

    const cfnNetworkPolicy = new CfnSecurityPolicy(this, "NetworkPolicy", {
      name: `${paramCase(name)}-network-policy`,
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
