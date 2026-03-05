import axios from "axios";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

function getHeaders(): Record<string, string> {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) throw new Error("RAILWAY_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

interface RailwayProjectResponse {
  data: {
    projectCreate: {
      id: string;
      name: string;
    };
  };
}

interface RailwayServiceResponse {
  data: {
    serviceCreate: {
      id: string;
      name: string;
    };
  };
}

interface RailwayDeploymentResponse {
  data: {
    deployments: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          staticUrl?: string;
          url?: string;
        };
      }>;
    };
  };
}

interface RailwayEnvVarResponse {
  data: {
    variableCollectionUpsert: boolean;
  };
}

export interface RailwayDeployResult {
  projectId: string;
  serviceId: string;
  siteUrl: string;
}

export async function deployToRailway(
  slug: string,
  githubRepoUrl: string,
  envVars: Record<string, string>
): Promise<RailwayDeployResult> {
  const headers = getHeaders();

  // 1. Create project
  const projectRes = await axios.post<RailwayProjectResponse>(
    RAILWAY_API,
    {
      query: `
        mutation ProjectCreate($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            id
            name
          }
        }
      `,
      variables: {
        input: {
          name: `leadforge-${slug}`,
        },
      },
    },
    { headers, timeout: 30_000 }
  );

  const projectId = projectRes.data.data.projectCreate.id;
  console.log(`[Railway] Created project: ${projectId}`);

  // 2. Create service from GitHub repo
  const repoOwner = githubRepoUrl.replace("https://github.com/", "").split("/")[0];
  const repoName = githubRepoUrl.replace("https://github.com/", "").split("/")[1];

  const serviceRes = await axios.post<RailwayServiceResponse>(
    RAILWAY_API,
    {
      query: `
        mutation ServiceCreate($input: ServiceCreateInput!) {
          serviceCreate(input: $input) {
            id
            name
          }
        }
      `,
      variables: {
        input: {
          name: slug,
          projectId,
          source: {
            repo: `${repoOwner}/${repoName}`,
          },
        },
      },
    },
    { headers, timeout: 30_000 }
  );

  const serviceId = serviceRes.data.data.serviceCreate.id;
  console.log(`[Railway] Created service: ${serviceId}`);

  // 3. Set environment variables
  if (Object.keys(envVars).length > 0) {
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(envVars)) {
      variables[key] = value;
    }

    await axios.post<RailwayEnvVarResponse>(
      RAILWAY_API,
      {
        query: `
          mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
            variableCollectionUpsert(input: $input)
          }
        `,
        variables: {
          input: {
            projectId,
            serviceId,
            variables,
          },
        },
      },
      { headers, timeout: 30_000 }
    );
  }

  // 4. Poll until deployment is live
  const siteUrl = await pollDeployment(projectId, serviceId, headers);

  return { projectId, serviceId, siteUrl };
}

async function pollDeployment(
  projectId: string,
  serviceId: string,
  headers: Record<string, string>
): Promise<string> {
  const maxAttempts = 60; // 10 minutes at 10s intervals
  const delayMs = 10_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(delayMs);

    const res = await axios.post<RailwayDeploymentResponse>(
      RAILWAY_API,
      {
        query: `
          query Deployments($projectId: String!, $serviceId: String!) {
            deployments(
              input: { projectId: $projectId, serviceId: $serviceId }
            ) {
              edges {
                node {
                  id
                  status
                  staticUrl
                  url
                }
              }
            }
          }
        `,
        variables: { projectId, serviceId },
      },
      { headers, timeout: 30_000 }
    );

    const deployments = res.data.data.deployments.edges;
    if (deployments.length === 0) continue;

    const latest = deployments[0].node;

    if (latest.status === "SUCCESS" || latest.status === "ACTIVE") {
      const url = latest.staticUrl ?? latest.url ?? `https://${serviceId}.up.railway.app`;
      console.log(`[Railway] Deployment live at: ${url}`);
      return url;
    }

    if (latest.status === "FAILED" || latest.status === "CRASHED") {
      throw new Error(`Railway deployment failed with status: ${latest.status}`);
    }

    console.log(`[Railway] Deployment status: ${latest.status} (attempt ${attempt + 1}/${maxAttempts})`);
  }

  throw new Error("Railway deployment timed out after 10 minutes");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
