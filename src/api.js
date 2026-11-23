const API_BASE_URL = "http://127.0.0.1:5001";

export async function checkBackend() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);

    if (!response.ok) {
      throw new Error("Backend request failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Backend connection error:", error);
    throw error;
  }
}

// Upload one CV while reporting the browser's actual transfer progress.
export function uploadCv(file, candidate, onProgress, candidateId = null) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", candidate.name);
    formData.append("email", candidate.email);
    formData.append("phone", candidate.phone);
    formData.append("position", candidate.position);
    if (candidateId !== null) {
      formData.append("candidate_id", candidateId);
    }

    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/api/cvs`);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      let response;
      try {
        response = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The server returned an unreadable response."));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(new Error(response.error || "Failed to upload CV."));
        return;
      }
      resolve(response);
    });
    request.addEventListener("error", () => {
      reject(new Error("Could not connect to the server. Check that the backend is running."));
    });
    request.addEventListener("abort", () => reject(new Error("CV upload was cancelled.")));
    request.send(formData);
  });
}

export async function extractCvDetails(file) {
  const formData = new FormData();
  formData.append("file", file);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/cvs/extract`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error("Could not connect to the server. Check that the backend is running.");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not extract details from this CV.");
  }
  return data;
}

export async function checkCandidateMatches(candidate) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/candidates/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: candidate.email, phone: candidate.phone }),
    });
  } catch {
    throw new Error("Could not connect to the server. Check that the backend is running.");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not check for an existing candidate.");
  }
  return data;
}


// Get all candidates
export async function getCandidates() {
  const response = await fetch(`${API_BASE_URL}/api/candidates`);

  if (!response.ok) {
    throw new Error("Failed to fetch candidates");
  }

  return await response.json();
}

// Get one page of candidates from the backend.
export async function getPaginatedCandidates(page = 1, pageSize = 25, search = "") {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  const response = await fetch(
    `${API_BASE_URL}/api/candidates/paginated?${params.toString()}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch candidates");
  }

  return data;
}

export async function getDashboardSummary() {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load dashboard summary.");
  }
  return data;
}

export async function getCandidateApplications(candidateId) {
  const response = await fetch(
    `${API_BASE_URL}/api/candidates/${candidateId}/applications`
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load application history.");
  }
  return data.applications;
}

export function getApplicationCvUrl(applicationId) {
  return `${API_BASE_URL}/api/applications/${applicationId}/cv`;
}


// Add a candidate
export async function addCandidate(candidate) {
  const response = await fetch(`${API_BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(candidate),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to add candidate");
  }

  return await response.json();
}

// Update a candidate
export async function updateCandidate(id, candidate) {
  const response = await fetch(`${API_BASE_URL}/api/candidates/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(candidate),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update candidate");
  }

  return await response.json();
}

// Delete a candidate
export async function deleteCandidate(id) {
  const response = await fetch(`${API_BASE_URL}/api/candidates/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete candidate");
  }

  return await response.json();
}
