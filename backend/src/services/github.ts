import axios from "axios";

const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function getUsername(): string {
  const username = process.env.GITHUB_USERNAME;
  if (!username) throw new Error("GITHUB_USERNAME not configured");
  return username;
}

export async function createRepo(repoName: string, description: string): Promise<string> {
  const headers = getHeaders();
  const sanitised = repoName.replace(/[^a-zA-Z0-9-_.]/g, "-").slice(0, 100);

  const response = await axios.post<{ html_url: string; full_name: string }>(
    `${GITHUB_API}/user/repos`,
    {
      name: sanitised,
      description,
      private: false,
      auto_init: true,
    },
    { headers, timeout: 30_000 }
  );

  return response.data.html_url;
}

export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const headers = getHeaders();
  const response = await axios.get<{ default_branch: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}`,
    { headers, timeout: 15_000 }
  );
  return response.data.default_branch;
}

export async function getFileSha(
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<string | undefined> {
  const headers = getHeaders();
  try {
    const response = await axios.get<{ sha: string }>(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers, timeout: 15_000 }
    );
    return response.data.sha;
  } catch {
    return undefined;
  }
}

export async function upsertFile(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  branch: string
): Promise<void> {
  const headers = getHeaders();
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const sha = await getFileSha(owner, repo, filePath, branch);

  const body: Record<string, unknown> = {
    message,
    content: encoded,
    branch,
  };
  if (sha) body.sha = sha;

  await axios.put(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`,
    body,
    { headers, timeout: 30_000 }
  );
}

export async function pushFiles(
  repoUrl: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  // Validate GITHUB_USERNAME is configured; owner is derived from the repo URL
  getUsername();

  const urlParts = repoUrl.replace("https://github.com/", "").split("/");
  const owner = urlParts[0];
  const repoName = urlParts[1];

  const branch = await getDefaultBranch(owner, repoName);

  // Push files sequentially to avoid race conditions on the same ref
  for (const file of files) {
    await upsertFile(owner, repoName, file.path, file.content, `Add ${file.path}`, branch);
  }

  console.log(`[GitHub] Pushed ${files.length} files to ${repoUrl}`);
}

export async function createRepoAndPush(
  slug: string,
  businessName: string,
  files: Array<{ path: string; content: string }>
): Promise<string> {
  const repoName = `leadforge-${slug}`;
  const description = `Website for ${businessName} built by LeadForge AI`;

  const repoUrl = await createRepo(repoName, description);

  // Brief delay to let GitHub initialise the new repo before pushing
  await sleep(2000);

  await pushFiles(repoUrl, files);

  return repoUrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
