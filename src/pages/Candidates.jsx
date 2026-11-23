import { useState, useEffect } from "react";

import {
  getCandidates,
  getPaginatedCandidates,
  getCandidateApplications,
  getApplicationCvUrl,
  addCandidate,
  updateCandidate,
  deleteCandidate as deleteCandidateApi,
} from "../api";

import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Card,
  CardContent,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Pagination,
  useMediaQuery,
} from "@mui/material";

import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

const statuses = [
  "New",
  "Screening",
  "Shortlisted",
  "Interview",
  "Selected",
  "Rejected",
  "On Hold",
];

const defaultForm = {
  name: "",
  phone: "",
  email: "",
  position: "",
  status: "New",
  remarks: "",
};

const actionButtonBaseSx = {
  minWidth: "max-content",
  minHeight: 32,
  px: 1,
  py: 0.5,
  borderRadius: 1.5,
  textTransform: "none",
  fontSize: "0.75rem",
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap",
  color: "#334155",
  borderColor: "#cbd5e1",
  bgcolor: "#ffffff",
  "& .MuiButton-startIcon": { marginLeft: 0, marginRight: 0.5 },
  "&:hover": { bgcolor: "#f8fafc", borderColor: "#94a3b8" },
};

function getStatusColor(status) {
  const colors = {
    New: "info",
    Screening: "warning",
    Shortlisted: "primary",
    Interview: "secondary",
    Selected: "success",
    Rejected: "error",
    "On Hold": "default",
  };

  return colors[status] || "default";
}

function formatHistoryTimestamp(value) {
  if (!value) return "Date unavailable";

  const compactTimestamp = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{6})Z$/
  );
  const normalizedValue = compactTimestamp
    ? `${compactTimestamp[1]}-${compactTimestamp[2]}-${compactTimestamp[3]}T${compactTimestamp[4]}:${compactTimestamp[5]}:${compactTimestamp[6]}.${compactTimestamp[7].slice(0, 3)}Z`
    : value;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getCandidateCreatedAt(candidate) {
  if (!candidate.created_at) return 0;

  const value = String(candidate.created_at);
  const normalizedValue = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalizedValue);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function Candidates() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const showCompactList = useMediaQuery(theme.breakpoints.down("md"));

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [positions, setPositions] = useState([]);
  const [allCandidatesCache, setAllCandidatesCache] = useState(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [positionFilter, setPositionFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters and non-default sorting remain client-side until their backend
  // query support is implemented in the following steps.
  const useClientSideDataset = Boolean(
    statusFilter !== "All" ||
    positionFilter !== "All" ||
    sortOrder !== "Newest"
  );
  const backendSearch = useClientSideDataset ? "" : debouncedSearch;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});

  const [editingCandidate, setEditingCandidate] = useState(null);
  const [viewCandidate, setViewCandidate] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [applicationHistory, setApplicationHistory] = useState([]);
  const [applicationHistoryLoading, setApplicationHistoryLoading] = useState(false);
  const [applicationHistoryError, setApplicationHistoryError] = useState("");

  // Load candidates from backend
  useEffect(() => {
    let cancelled = false;

    async function fetchCandidates() {
      setLoading(true);
      setError("");

      try {
        if (useClientSideDataset) {
          const data = allCandidatesCache ?? await getCandidates();

          if (!cancelled) {
            setCandidates(data);
            setTotalCandidates(data.length);
            setServerTotalPages(Math.max(1, Math.ceil(data.length / pageSize)));
            setPositions([
              ...new Set(data.map((candidate) => candidate.position)),
            ]);
            if (allCandidatesCache === null) {
              setAllCandidatesCache(data);
            }
          }
        } else {
          const data = await getPaginatedCandidates(
            currentPage,
            pageSize,
            backendSearch
          );
          const lastAvailablePage = Math.max(1, data.total_pages);

          if (!cancelled && currentPage > lastAvailablePage) {
            setCurrentPage(lastAvailablePage);
            return;
          }

          if (!cancelled) {
            setCandidates(data.candidates);
            setTotalCandidates(data.total);
            setServerTotalPages(lastAvailablePage);
            setPositions(data.positions || []);
          }
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setError(
            "Unable to load candidates. Please check the backend."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchCandidates();

    return () => {
      cancelled = true;
    };
  }, [
    retryCount,
    currentPage,
    pageSize,
    useClientSideDataset,
    backendSearch,
    allCandidatesCache,
  ]);

  useEffect(() => {
    if (!viewCandidate?.id) return undefined;

    let cancelled = false;
    setApplicationHistoryLoading(true);
    setApplicationHistoryError("");
    getCandidateApplications(viewCandidate.id)
      .then((history) => {
        if (!cancelled) setApplicationHistory(history);
      })
      .catch((historyError) => {
        if (!cancelled) {
          setApplicationHistoryError(
            historyError.message || "Unable to load application history."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setApplicationHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewCandidate?.id]);

  // Search, filter and sort candidates
  const filteredCandidates = candidates
    .filter((candidate) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        !useClientSideDataset ||
        candidate.name.toLowerCase().includes(searchText) ||
        candidate.email.toLowerCase().includes(searchText) ||
        candidate.phone.includes(searchText);

      const matchesStatus =
        statusFilter === "All" || candidate.status === statusFilter;

      const matchesPosition =
        positionFilter === "All" ||
        candidate.position === positionFilter;

      return matchesSearch && matchesStatus && matchesPosition;
    })
    .sort((a, b) => {
      if (sortOrder === "Name A-Z") {
        return a.name.localeCompare(b.name);
      }

      if (sortOrder === "Name Z-A") {
        return b.name.localeCompare(a.name);
      }

      const timestampDifference =
        getCandidateCreatedAt(b) - getCandidateCreatedAt(a);
      return timestampDifference || b.id - a.id;
    });

  const resultCount = useClientSideDataset
    ? filteredCandidates.length
    : totalCandidates;
  const totalPages = useClientSideDataset
    ? Math.max(1, Math.ceil(filteredCandidates.length / pageSize))
    : serverTotalPages;
  const displayedPage = Math.min(currentPage, totalPages);
  const visibleCandidates = useClientSideDataset
    ? filteredCandidates.slice(
        (displayedPage - 1) * pageSize,
        displayedPage * pageSize
      )
    : filteredCandidates;

  // Delete candidate
  async function handleDeleteCandidate() {
    if (!deleteCandidate) return;

    try {
      await deleteCandidateApi(deleteCandidate.id);

      setCandidates((previous) =>
        previous.filter(
          (candidate) => candidate.id !== deleteCandidate.id
        )
      );
      setAllCandidatesCache((previous) => previous?.filter(
        (candidate) => candidate.id !== deleteCandidate.id
      ) ?? previous);
      setRetryCount((previous) => previous + 1);

      setDeleteCandidate(null);
    } catch (error) {
      console.error(error);
      alert("Failed to delete candidate. Please check the backend.");
    }
  }

  // Handle form changes
  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFormErrors((previous) => ({
      ...previous,
      [name]: "",
      submit: "",
    }));
  }

  // Validate form
  function validateForm() {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.position.trim()) {
      errors.position = "Position is required";
    }

    const phoneRegex = /^\+?[0-9\s\-().]{7,20}$/;

    if (!formData.phone.trim()) {
      errors.phone = "Phone number is required";
    } else if (!phoneRegex.test(formData.phone)) {
      errors.phone = "Enter a valid phone number";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!emailRegex.test(formData.email)) {
      errors.email = "Enter a valid email address";
    }

    return errors;
  }

  // Add or update candidate
  async function handleSaveCandidate(event) {
    event.preventDefault();

    const errors = validateForm();
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      if (editingCandidate) {
        const updatedCandidate = await updateCandidate(
          editingCandidate.id,
          formData
        );

        setCandidates((previous) =>
          previous.map((candidate) =>
            candidate.id === updatedCandidate.id
              ? updatedCandidate
              : candidate
          )
        );
        setAllCandidatesCache((previous) => previous?.map((candidate) =>
          candidate.id === updatedCandidate.id ? updatedCandidate : candidate
        ) ?? previous);
      } else {
        const newCandidate = await addCandidate(formData);

        setCandidates((previous) => [newCandidate, ...previous]);
        setAllCandidatesCache((previous) => previous ? [newCandidate, ...previous] : previous);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error(error);

      setFormErrors((previous) => ({
        ...previous,
        submit: error.message,
      }));

      return;
    }

    setRetryCount((previous) => previous + 1);

    setFormData(defaultForm);
    setFormErrors({});
    setEditingCandidate(null);
    setDialogOpen(false);
  }

  // Open Add Candidate dialog
  function openAddDialog() {
    setEditingCandidate(null);
    setFormData(defaultForm);
    setFormErrors({});
    setDialogOpen(true);
  }

  // Open Edit Candidate dialog
  function openEditDialog(candidate) {
    setEditingCandidate(candidate);

    setFormData({
      name: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      position: candidate.position,
      status: candidate.status,
      remarks: candidate.remarks || "",
    });

    setFormErrors({});
    setDialogOpen(true);
  }

  // Close form dialog
  function closeFormDialog() {
    setDialogOpen(false);
    setFormErrors({});
  }

  return (
    <Box>
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography color="text.secondary">
            Manage and track candidate applications.
          </Typography>
        </Box>

        <Button
          variant="contained"
          onClick={openAddDialog}
          sx={{
            textTransform: "none",
            borderRadius: 2,
            width: { xs: "100%", sm: "auto" },
          }}
        >
          + Add Candidate
        </Button>
      </Box>

      {/* Filters */}
      <Card
        elevation={0}
        sx={{
          border: "1px solid #e2e8f0",
          borderRadius: 3,
          mb: 3,
        }}
      >
        <CardContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                lg: "2fr 1fr 1fr 1fr",
              },
              gap: 2,
            }}
          >
            <TextField
              label="Search candidates"
              placeholder="Name, phone or email"
              size="small"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              fullWidth
            />

            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <MenuItem value="All">All Statuses</MenuItem>

              {statuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Position"
              size="small"
              value={positionFilter}
              onChange={(e) => {
                setPositionFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <MenuItem value="All">All Positions</MenuItem>

              {positions.map((position) => (
                <MenuItem key={position} value={position}>
                  {position}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Sort By"
              size="small"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setCurrentPage(1);
              }}
            >
              <MenuItem value="Newest">Newest</MenuItem>
              <MenuItem value="Name A-Z">Name A-Z</MenuItem>
              <MenuItem value="Name Z-A">Name Z-A</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      {/* Loading / Error / Results Count */}
      {loading ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Loading candidates...
        </Typography>
      ) : error ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography color="error">{error}</Typography>

          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              setRetryCount((previous) => previous + 1)
            }
            sx={{
              textTransform: "none",
              width: "fit-content",
            }}
          >
            Retry
          </Button>
        </Stack>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          {resultCount} candidate(s) found
        </Typography>
      )}

      {/* Desktop Table */}
      {!showCompactList && (
      <Box>
        <Card
          elevation={0}
          sx={{
            border: "1px solid #e2e8f0",
            borderRadius: 3,
          }}
        >
          <TableContainer sx={{ width: "100%", maxWidth: "100%" }}>
            <Table sx={{ width: "100%", tableLayout: "fixed" }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "#f8fafc" }}>
                  <TableCell sx={{ width: "15%" }}>
                    <strong>Name</strong>
                  </TableCell>

                  <TableCell sx={{ width: "26%" }}>
                    <strong>Contact</strong>
                  </TableCell>

                  <TableCell sx={{ width: "12%" }}>
                    <strong>Position</strong>
                  </TableCell>

                  <TableCell sx={{ width: "11%" }}>
                    <strong>Status</strong>
                  </TableCell>

                  <TableCell sx={{ width: "14%" }}>
                    <strong>Remarks</strong>
                  </TableCell>

                  <TableCell sx={{ width: "22%" }}>
                    <strong>Action</strong>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {visibleCandidates.map((candidate) => (
                  <TableRow key={candidate.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>
                        {candidate.name}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {candidate.phone}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {candidate.email}
                      </Typography>
                    </TableCell>

                    <TableCell>{candidate.position}</TableCell>

                    <TableCell>
                      <Chip
                        label={candidate.status}
                        color={getStatusColor(candidate.status)}
                        size="small"
                      />
                    </TableCell>

                    <TableCell>
                      {candidate.remarks || "—"}
                    </TableCell>

                    <TableCell>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 0.75,
                          width: "100%",
                          minWidth: 0,
                          "& .MuiButton-root": {
                            width: "100%",
                            minWidth: 0,
                            px: 0.75,
                          },
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                          onClick={() => setViewCandidate(candidate)}
                          sx={{
                            ...actionButtonBaseSx,
                          }}
                        >
                          View
                        </Button>

                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditOutlinedIcon fontSize="small" />}
                          onClick={() => openEditDialog(candidate)}
                          sx={{
                            ...actionButtonBaseSx,
                          }}
                        >
                          Edit
                        </Button>
                        {candidate.cv_filename ? (
                          <Button
                            component="a"
                            href={getApplicationCvUrl(candidate.latest_cv_application_id)}
                            size="small"
                            variant="outlined"
                            startIcon={<DownloadOutlinedIcon fontSize="small" />}
                            sx={{
                              ...actionButtonBaseSx,
                              gridColumn: "1 / -1",
                            }}
                          >
                            Download CV
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DownloadOutlinedIcon fontSize="small" />}
                            disabled
                            title="No CV uploaded for the latest application"
                            sx={{
                              ...actionButtonBaseSx,
                              gridColumn: "1 / -1",
                            }}
                          >
                            Download CV
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredCandidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No candidates found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
      )}

      {/* Mobile Cards */}
      {showCompactList && (
      <Stack spacing={2}>
        {visibleCandidates.map((candidate) => (
          <Card
            key={candidate.id}
            elevation={0}
            sx={{
              border: "1px solid #e2e8f0",
              borderRadius: 3,
            }}
          >
            <CardContent>
              <Stack spacing={1.5}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 1,
                  }}
                >
                  <Typography fontWeight={700}>
                    {candidate.name}
                  </Typography>

                  <Chip
                    label={candidate.status}
                    color={getStatusColor(candidate.status)}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary">
                  {candidate.position}
                </Typography>

                <Divider />

                <Typography variant="body2">
                  📞 {candidate.phone}
                </Typography>

                <Typography
                  variant="body2"
                  sx={{ wordBreak: "break-word" }}
                >
                  ✉️ {candidate.email}
                </Typography>

                {candidate.remarks && (
                  <Typography variant="body2" color="text.secondary">
                    Remarks: {candidate.remarks}
                  </Typography>
                )}

                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                    onClick={() => setViewCandidate(candidate)}
                    sx={{
                      ...actionButtonBaseSx,
                    }}
                  >
                    View
                  </Button>

                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditOutlinedIcon fontSize="small" />}
                    onClick={() => openEditDialog(candidate)}
                    sx={{
                      ...actionButtonBaseSx,
                    }}
                  >
                    Edit
                  </Button>
                  {candidate.cv_filename ? (
                    <Button
                      component="a"
                      href={getApplicationCvUrl(candidate.latest_cv_application_id)}
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadOutlinedIcon fontSize="small" />}
                      sx={{
                        ...actionButtonBaseSx,
                      }}
                    >
                      Download CV
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadOutlinedIcon fontSize="small" />}
                      disabled
                      title="No CV uploaded for the latest application"
                      sx={{ ...actionButtonBaseSx }}
                    >
                      Download CV
                    </Button>
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
      )}

      {!loading && !error && resultCount > 0 && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
          sx={{ mt: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            Showing {(displayedPage - 1) * pageSize + 1}
            {"–"}
            {Math.min(displayedPage * pageSize, resultCount)} of {resultCount}
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems="center"
            spacing={1.5}
          >
            <TextField
              select
              label="Rows per page"
              size="small"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              sx={{ minWidth: 145 }}
            >
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
            </TextField>

            <Pagination
              count={totalPages}
              page={displayedPage}
              onChange={(_, page) => setCurrentPage(page)}
              color="primary"
              size="small"
              siblingCount={0}
              boundaryCount={1}
            />
          </Stack>
        </Stack>
      )}

      {/* Add / Edit Candidate Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeFormDialog}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={handleSaveCandidate}>
          <DialogTitle
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {editingCandidate ? "Edit Candidate" : "Add Candidate"}

            <IconButton onClick={closeFormDialog}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {formErrors.submit && (
                <Typography color="error">
                  {formErrors.submit}
                </Typography>
              )}

              <TextField
                label="Full Name"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                required
                fullWidth
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
              />

              <TextField
                label="Phone Number"
                name="phone"
                value={formData.phone}
                onChange={handleFormChange}
                required
                fullWidth
                type="tel"
                error={Boolean(formErrors.phone)}
                helperText={formErrors.phone}
              />

              <TextField
                label="Email"
                name="email"
                value={formData.email}
                onChange={handleFormChange}
                required
                fullWidth
                type="email"
                error={Boolean(formErrors.email)}
                helperText={formErrors.email}
              />

              <TextField
                label="Position"
                name="position"
                value={formData.position}
                onChange={handleFormChange}
                required
                fullWidth
                error={Boolean(formErrors.position)}
                helperText={formErrors.position}
              />

              <TextField
                select
                label="Status"
                name="status"
                value={formData.status}
                onChange={handleFormChange}
                fullWidth
              >
                {statuses.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Remarks"
                name="remarks"
                value={formData.remarks}
                onChange={handleFormChange}
                multiline
                rows={3}
                fullWidth
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button
              onClick={closeFormDialog}
              color="inherit"
              sx={{ textTransform: "none" }}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="contained"
              sx={{ textTransform: "none" }}
            >
              {editingCandidate ? "Save Changes" : "Add Candidate"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* View Candidate Dialog */}
      <Dialog
        open={Boolean(viewCandidate)}
        onClose={() => setViewCandidate(null)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
      >
        {viewCandidate && (
          <>
            <DialogTitle
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              Candidate Details

              <IconButton onClick={() => setViewCandidate(null)}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h5" fontWeight={700}>
                    {viewCandidate.name}
                  </Typography>

                  <Box sx={{ mt: 1 }}>
                    <Chip
                      label={viewCandidate.status}
                      color={getStatusColor(viewCandidate.status)}
                    />
                  </Box>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Position
                  </Typography>

                  <Typography fontWeight={500}>
                    {viewCandidate.position}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Phone Number
                  </Typography>

                  <Typography fontWeight={500}>
                    {viewCandidate.phone}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Email
                  </Typography>

                  <Typography
                    fontWeight={500}
                    sx={{ wordBreak: "break-word" }}
                  >
                    {viewCandidate.email}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Remarks
                  </Typography>

                  <Typography>
                    {viewCandidate.remarks || "No remarks available"}
                  </Typography>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
                    Application history
                  </Typography>

                  {applicationHistoryLoading ? (
                    <Typography color="text.secondary">
                      Loading application history…
                    </Typography>
                  ) : applicationHistoryError ? (
                    <Typography color="error">{applicationHistoryError}</Typography>
                  ) : applicationHistory.length === 0 ? (
                    <Typography color="text.secondary">
                      No application history available.
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {applicationHistory.map((application, index) => (
                        <Card
                          key={application.id}
                          variant="outlined"
                          sx={{ borderRadius: 2 }}
                        >
                          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                              spacing={1}
                            >
                              <Typography fontWeight={600}>
                                Application {index + 1}
                              </Typography>
                              <Chip
                                size="small"
                                label={application.status}
                                color={getStatusColor(application.status)}
                              />
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Position: {application.position}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Applied: {formatHistoryTimestamp(application.applied_at)}
                            </Typography>
                            {application.remarks && (
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                Remarks: {application.remarks}
                              </Typography>
                            )}
                            {application.cv_filename && (
                              <Button
                                component="a"
                                href={getApplicationCvUrl(application.id)}
                                target="_blank"
                                rel="noreferrer"
                                size="small"
                                sx={{ mt: 1, textTransform: "none" }}
                              >
                                Download CV
                              </Button>
                            )}

                            <Divider sx={{ my: 1.5 }} />
                            <Typography variant="body2" fontWeight={600}>
                              Status history
                            </Typography>
                            {application.status_events.length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                No status changes recorded.
                              </Typography>
                            ) : (
                              <Stack spacing={1} sx={{ mt: 1 }}>
                                {application.status_events.map((event) => (
                                  <Box
                                    key={event.id}
                                    sx={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      alignItems: "center",
                                      gap: 1,
                                    }}
                                  >
                                    <Chip
                                      size="small"
                                      label={event.status}
                                      color={getStatusColor(event.status)}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                      {formatHistoryTimestamp(event.changed_at)}
                                    </Typography>
                                    {event.remarks && (
                                      <Typography variant="body2">
                                        {event.remarks}
                                      </Typography>
                                    )}
                                  </Box>
                                ))}
                              </Stack>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
              <Button
                color="inherit"
                onClick={() => setViewCandidate(null)}
                sx={{ textTransform: "none" }}
              >
                Close
              </Button>

              <Button
                variant="contained"
                onClick={() => {
                  const candidate = viewCandidate;
                  setViewCandidate(null);
                  openEditDialog(candidate);
                }}
                sx={{ textTransform: "none" }}
              >
                Edit Candidate
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete Candidate?</DialogTitle>

        <DialogContent>
          <Typography>
            Are you sure you want to delete{" "}
            <strong>{deleteCandidate?.name}</strong>?
          </Typography>

          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ mt: 1 }}
          >
            Candidate and application history will be deleted. Uploaded CV files
            will remain in the CV folder and will no longer appear in this candidate’s history.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeleteCandidate(null)}
            color="inherit"
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteCandidate}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Candidates;
