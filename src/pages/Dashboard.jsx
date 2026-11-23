import { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  TextField,
  LinearProgress,
  Alert,
} from "@mui/material";

import {
  checkCandidateMatches,
  extractCvDetails,
  getDashboardSummary,
  uploadCv,
} from "../api";

const MAX_CV_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function Dashboard() {
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCv, setSelectedCv] = useState(null);
  const [cvFileError, setCvFileError] = useState("");
  const [cvDetails, setCvDetails] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
  });
  const [extractingCv, setExtractingCv] = useState(false);
  const [checkingCandidate, setCheckingCandidate] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cvUploadSuccess, setCvUploadSuccess] = useState("");
  const [candidateMatches, setCandidateMatches] = useState([]);
  const cvInputRef = useRef(null);

  useEffect(() => {
    loadDashboardSummary();
  }, []);

  async function loadDashboardSummary() {
    try {
      setLoading(true);
      setError("");

      const data = await getDashboardSummary();
      setDashboardSummary(data);
    } catch (err) {
      setError(err.message || "Failed to load dashboard summary.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadCv() {
    if (!selectedCv) return;
    if (
      !cvDetails.name.trim() ||
      !cvDetails.email.trim() ||
      !cvDetails.phone.trim() ||
      !cvDetails.position.trim()
    ) {
      setCvFileError("Enter the candidate's name, email, phone, and position to upload the CV.");
      return;
    }

    setCheckingCandidate(true);
    setCvFileError("");
    setCvUploadSuccess("");
    setCandidateMatches([]);
    try {
      const matchResult = await checkCandidateMatches(cvDetails);
      const matchMap = new Map();
      for (const [matchedBy, matches] of [
        ["email", matchResult.email_matches],
        ["phone", matchResult.phone_matches],
      ]) {
        for (const candidate of matches) {
          const existing = matchMap.get(candidate.id);
          matchMap.set(candidate.id, {
            ...candidate,
            matchedBy: [...(existing?.matchedBy || []), matchedBy],
          });
        }
      }
      const matches = [...matchMap.values()];
      if (matches.length > 0) {
        setCandidateMatches(matches);
        return;
      }

      await submitCvUpload();
    } catch (err) {
      setCvFileError(err.message || "Failed to check for an existing candidate.");
    } finally {
      setCheckingCandidate(false);
    }
  }

  async function submitCvUpload(candidateId = null) {
    setCandidateMatches([]);
    setCvFileError("");
    setUploadingCv(true);
    setUploadProgress(0);
    try {
      const result = await uploadCv(selectedCv, cvDetails, setUploadProgress, candidateId);
      setCvUploadSuccess(`Uploaded as ${result.filename}`);
      setSelectedCv(null);
      setCvDetails({ name: "", email: "", phone: "", position: "" });
      await loadDashboardSummary();
    } catch (err) {
      setCvFileError(err.message || "Failed to upload CV.");
    } finally {
      setUploadingCv(false);
    }
  }

  function cancelExistingCandidateUpload() {
    setCandidateMatches([]);
    setSelectedCv(null);
    setCvDetails({ name: "", email: "", phone: "", position: "" });
    setCvFileError("");
  }

  async function handleCvSelection(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const isSupported = /\.(pdf|docx)$/i.test(file.name);
    const isWithinSizeLimit = file.size <= MAX_CV_FILE_SIZE_BYTES;
    setCvUploadSuccess("");
    setCandidateMatches([]);
    setCvFileError(
      !isSupported
        ? "Please select a PDF or DOCX file."
        : !isWithinSizeLimit
          ? "CV file must be 10 MB or smaller."
          : ""
    );
    setSelectedCv(isSupported && isWithinSizeLimit ? file : null);
    setCvDetails({ name: "", email: "", phone: "", position: "" });
    if (!isSupported || !isWithinSizeLimit) return;

    setExtractingCv(true);
    try {
      const details = await extractCvDetails(file);
      setCvDetails({
        name: details.name || "",
        email: details.email || "",
        phone: details.phone || "",
        position: "",
      });
      setCvFileError(details.warning || "");
    } catch (err) {
      setCvFileError(err.message || "Could not extract details from this CV.");
    } finally {
      setExtractingCv(false);
    }
  }

  const totalCandidates = dashboardSummary?.total_candidates ?? 0;
  const statusCounts = dashboardSummary?.status_counts ?? {};
  const statusCards = [
    { title: "New", symbol: "✦", color: "#0284c7", background: "#e0f2fe" },
    { title: "Screening", symbol: "⌕", color: "#d97706", background: "#fef3c7" },
    { title: "Shortlisted", symbol: "★", color: "#4f46e5", background: "#e0e7ff" },
    { title: "Interview", symbol: "◷", color: "#9333ea", background: "#f3e8ff" },
    { title: "Selected", symbol: "✓", color: "#16a34a", background: "#dcfce7" },
    { title: "Rejected", symbol: "×", color: "#dc2626", background: "#fee2e2" },
    { title: "On Hold", symbol: "Ⅱ", color: "#475569", background: "#e2e8f0" },
  ].map((status) => ({
    ...status,
    value: statusCounts[status.title] ?? 0,
  }));

  const otherStatusCount = Object.entries(statusCounts).reduce(
    (total, [status, count]) =>
      statusCards.some((knownStatus) => knownStatus.title === status)
        ? total
        : total + count,
    0
  );

  const recentCandidates = dashboardSummary?.recent_candidates ?? [];

  const summaryCards = [
    {
      title: "Total Candidates",
      value: totalCandidates,
      symbol: "👥",
      color: "#2563eb",
      background: "#dbeafe",
    },
    ...statusCards,
    ...(otherStatusCount > 0
      ? [{
          title: "Other Status",
          value: otherStatusCount,
          symbol: "⋯",
          color: "#475569",
          background: "#e2e8f0",
        }]
      : []),
  ];

  return (
    <Box>
      {/* Heading */}
      <Box sx={{ mb: 3 }}>
        <Typography color="text.secondary">
          Welcome back! Here's an overview of your recruitment activity.
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(4, 1fr)",
          },
          gap: 2,
          mb: 3,
        }}
      >
        {summaryCards.map((card) => (
          <Card
            key={card.title}
            elevation={0}
            sx={{
              border: "1px solid #e2e8f0",
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    {card.title}
                  </Typography>

                  <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>
                    {loading ? "—" : card.value}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 3,
                    bgcolor: card.background,
                    color: card.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  {card.symbol}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Upload CV */}
      <Card
        elevation={0}
        sx={{
          border: "1px solid #e2e8f0",
          borderRadius: 3,
          mb: 3,
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2, sm: 3 },
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Add New Candidates
            </Typography>

            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
              Upload resumes to add candidates to your database.
            </Typography>
          </Box>

          <Button
            variant="contained"
            onClick={() => cvInputRef.current?.click()}
            disabled={uploadingCv || extractingCv || checkingCandidate}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              px: 3,
              py: 1.2,
              width: { xs: "100%", sm: "auto" },
            }}
          >
            {selectedCv ? "Choose another CV" : "Choose CV"}
          </Button>
          <input
            ref={cvInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={handleCvSelection}
          />
        </CardContent>
        {selectedCv && (
          <Stack spacing={2} sx={{ px: 3, pb: 2 }}>
            <Typography color="text.secondary" variant="body2">
              Selected: {selectedCv.name}
            </Typography>
            {extractingCv && (
              <Typography color="text.secondary" variant="body2">
                Extracting candidate details…
              </Typography>
            )}
            <TextField
              label="Candidate name"
              size="small"
              value={cvDetails.name}
              disabled={uploadingCv || extractingCv || checkingCandidate}
              onChange={(event) => {
                setCandidateMatches([]);
                setCvDetails((details) => ({ ...details, name: event.target.value }))
              }}
            />
            <TextField
              label="Candidate phone"
              type="tel"
              size="small"
              value={cvDetails.phone}
              disabled={uploadingCv || extractingCv || checkingCandidate}
              onChange={(event) => {
                setCandidateMatches([]);
                setCvDetails((details) => ({ ...details, phone: event.target.value }))
              }}
            />
            <TextField
              label="Position"
              size="small"
              value={cvDetails.position}
              required
              disabled={uploadingCv || extractingCv || checkingCandidate}
              onChange={(event) => {
                setCandidateMatches([]);
                setCvDetails((details) => ({ ...details, position: event.target.value }));
              }}
            />
            <TextField
              label="Candidate email"
              type="email"
              size="small"
              value={cvDetails.email}
              disabled={uploadingCv || extractingCv || checkingCandidate}
              onChange={(event) => {
                setCandidateMatches([]);
                setCvDetails((details) => ({ ...details, email: event.target.value }))
              }}
            />
            <Button
              variant="contained"
              onClick={handleUploadCv}
              disabled={uploadingCv || extractingCv || checkingCandidate}
              sx={{ alignSelf: "flex-start", textTransform: "none" }}
            >
              {checkingCandidate
                ? "Checking candidate…"
                : uploadingCv
                  ? "Uploading…"
                  : "Upload CV"}
            </Button>
          </Stack>
        )}
        {candidateMatches.length > 0 && (
          <Alert severity="warning" sx={{ mx: 3, mb: 2 }}>
            {candidateMatches.length > 1 ? (
              <>
                Email and phone match different candidates. Upload is paused for
                recruiter review: {candidateMatches
                  .map((candidate) => `${candidate.matchedBy.join(" and ")}: ${candidate.name}`)
                  .join("; ")}.
              </>
            ) : (
              <Stack spacing={1.5}>
                <Typography>
                  <strong>{candidateMatches[0].name}</strong> already exists.
                  Latest application status: <strong>{candidateMatches[0].status}</strong>.
                  Continuing creates a new application. Previous applications and their
                  statuses can’t be edited afterward. Continue?
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => submitCvUpload(candidateMatches[0].id)}
                    disabled={uploadingCv}
                    sx={{ textTransform: "none" }}
                  >
                    Continue
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={cancelExistingCandidateUpload}
                    disabled={uploadingCv}
                    sx={{ textTransform: "none" }}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            )}
          </Alert>
        )}
        {uploadingCv && (
          <Stack spacing={0.5} sx={{ px: 3, pb: 2 }}>
            <LinearProgress variant="determinate" value={uploadProgress} />
            <Typography variant="caption" color="text.secondary">
              Uploading CV… {uploadProgress}%
            </Typography>
          </Stack>
        )}
        {cvFileError && (
          <Typography color="error" variant="body2" sx={{ px: 3, pb: 2 }}>
            {cvFileError}
          </Typography>
        )}
        {cvUploadSuccess && (
          <Typography color="success.main" variant="body2" sx={{ px: 3, pb: 2 }}>
            {cvUploadSuccess}
          </Typography>
        )}
      </Card>

      {/* Recent Candidates */}
      <Card
        elevation={0}
        sx={{
          border: "1px solid #e2e8f0",
          borderRadius: 3,
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Recent Candidates
          </Typography>

          {loading ? (
            <Typography color="text.secondary">
              Loading candidates...
            </Typography>
          ) : error ? (
            <Stack spacing={2}>
              <Typography color="error">{error}</Typography>

              <Button
                variant="outlined"
                onClick={loadDashboardSummary}
                sx={{ alignSelf: "flex-start", textTransform: "none" }}
              >
                Retry
              </Button>
            </Stack>
          ) : recentCandidates.length === 0 ? (
            <Typography color="text.secondary">
              No candidates added yet.
            </Typography>
          ) : (
            <Stack spacing={0}>
              {recentCandidates.map((candidate, index) => (
                <Box
                  key={candidate.id}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "flex-start", sm: "center" },
                    justifyContent: "space-between",
                    gap: 1,
                    py: 2,
                    borderBottom:
                      index !== recentCandidates.length - 1
                        ? "1px solid #f1f5f9"
                        : "none",
                  }}
                >
                  <Box>
                    <Typography fontWeight={600}>
                      {candidate.name}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      {candidate.position}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      bgcolor: "#f1f5f9",
                      color: "#475569",
                      borderRadius: 2,
                      px: 1.5,
                      py: 0.5,
                      fontSize: 13,
                    }}
                  >
                    {candidate.status}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Dashboard;
