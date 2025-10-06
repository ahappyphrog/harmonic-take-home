import { DataGrid, GridRowSelectionModel } from "@mui/x-data-grid";
import { useEffect, useState } from "react";
import {
  addCompaniesToCollection,
  bulkAddCompaniesFromCollection,
  getCollectionsById,
  getCollectionsMetadata,
  getTaskStatus,
  ICollection,
  ICompany,
  ITask,
} from "../utils/jam-api";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
} from "@mui/material";
import { FileDownload } from "@mui/icons-material";

const CompanyTable = (props: { selectedCollectionId: string }) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [selectAllTotal, setSelectAllTotal] = useState(false); // True when "select all total" is active
  const [deselectedIds, setDeselectedIds] = useState<Set<number>>(new Set()); // IDs deselected when selectAllTotal is true
  const [targetCollectionId, setTargetCollectionId] = useState<string>("");
  const [collections, setCollections] = useState<ICollection[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [currentTask, setCurrentTask] = useState<ITask | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  // Fetch collections for the dropdown
  useEffect(() => {
    getCollectionsMetadata().then((data) => {
      setCollections(data);
    });
  }, []);

  useEffect(() => {
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
      }
    );
  }, [props.selectedCollectionId, offset, pageSize]);

  useEffect(() => {
    setOffset(0);
    setSelectedRows([]);
    setSelectAllTotal(false);
    setDeselectedIds(new Set());
  }, [props.selectedCollectionId]);

  // Poll task status when a task is active
  useEffect(() => {
    if (!currentTask || currentTask.status === "completed" || currentTask.status === "failed") {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const updatedTask = await getTaskStatus(currentTask.id);
        setCurrentTask(updatedTask);

        if (updatedTask.status === "completed") {
          setShowProgressDialog(false);

          // Extract company count from the message if available
          const companyCount = updatedTask.progress?.total || 0;

          // Show completion notification
          setSnackbar({
            open: true,
            message: `Successfully exported ${companyCount.toLocaleString()} companies!`,
            severity: "success",
          });

          // Refresh the table
          getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
            (newResponse) => {
              setResponse(newResponse.companies);
              setTotal(newResponse.total);
            }
          );
        } else if (updatedTask.status === "failed") {
          setShowProgressDialog(false);
          setSnackbar({
            open: true,
            message: updatedTask.error || "Failed to add companies",
            severity: "error",
          });
        }
      } catch (error) {
        console.error("Error polling task status:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentTask, props.selectedCollectionId, offset, pageSize]);

  const refreshTable = () => {
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
      }
    );
  };

  // Check if all visible items are selected
  const allVisibleSelected = response.length > 0 && selectedRows.length === response.length;
  const showSelectAllBanner = allVisibleSelected && !selectAllTotal && (total ?? 0) > response.length;

  // Get the actual selection count
  const getSelectionCount = () => {
    if (selectAllTotal) {
      return (total ?? 0) - deselectedIds.size;
    }
    return selectedRows.length;
  };

  const handleSelectAllTotal = () => {
    setSelectAllTotal(true);
    setDeselectedIds(new Set());
  };

  const handleRowSelectionChange = (newSelection: GridRowSelectionModel) => {
    if (selectAllTotal) {
      // In "select all total" mode, track deselections as exceptions
      const currentPageIds = new Set(response.map((r) => r.id));
      const newSelectedIds = new Set(newSelection.map((id) => Number(id)));
      const newDeselected = new Set(deselectedIds);

      // Check which items on current page were deselected
      currentPageIds.forEach((id) => {
        if (!newSelectedIds.has(id)) {
          newDeselected.add(id);
        } else {
          newDeselected.delete(id);
        }
      });

      setDeselectedIds(newDeselected);

      // If user deselected everything, exit "select all total" mode
      if (newSelection.length === 0) {
        setSelectAllTotal(false);
        setDeselectedIds(new Set());
      }
    } else {
      setSelectedRows(newSelection);
    }
  };

  const handleExport = async () => {
    if (!targetCollectionId) return;

    const selectionCount = getSelectionCount();
    if (selectionCount === 0) return;

    setIsAdding(true);
    setShowExportDialog(false);

    try {
      if (selectAllTotal) {
        // Use bulk add, but we'll need to implement exception handling on backend
        // For now, use the bulk add endpoint
        const result = await bulkAddCompaniesFromCollection(
          targetCollectionId,
          props.selectedCollectionId
        );

        const sourceCollection = collections.find((c) => c.id === props.selectedCollectionId);
        const targetCollection = collections.find((c) => c.id === targetCollectionId);

        setCurrentTask({
          id: result.task_id,
          status: "pending",
          progress: { current: 0, total: result.estimated_count },
          message: `Exporting ${selectionCount.toLocaleString()} companies from "${sourceCollection?.collection_name}" to "${targetCollection?.collection_name}"`,
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setShowProgressDialog(true);

        setSnackbar({
          open: true,
          message: `Started exporting ${selectionCount.toLocaleString()} companies`,
          severity: "info",
        });
      } else {
        // Add only selected companies - show loading toast
        setSnackbar({
          open: true,
          message: `Exporting ${selectionCount.toLocaleString()} companies...`,
          severity: "info",
        });

        const companyIds = selectedRows.map((id) => Number(id));
        const result = await addCompaniesToCollection(targetCollectionId, companyIds);

        setSnackbar({
          open: true,
          message: `Successfully exported ${result.added_count} companies`,
          severity: "success",
        });
      }

      // Reset selection
      setSelectedRows([]);
      setSelectAllTotal(false);
      setDeselectedIds(new Set());
      setTargetCollectionId("");
      refreshTable();
    } catch (error) {
      setSnackbar({
        open: true,
        message: "Failed to export companies",
        severity: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const availableCollections = collections.filter(
    (c) => c.id !== props.selectedCollectionId
  );

  const hasSelection = getSelectionCount() > 0;

  const progressPercentage = currentTask?.progress
    ? Math.round((currentTask.progress.current / currentTask.progress.total) * 100)
    : 0;

  return (
    <>
      {/* Progress Modal - Bottom Right Corner (outside main container) */}
      {showProgressDialog && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            right: 20,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <Card
            sx={{
              minWidth: 280,
              maxWidth: 320,
              boxShadow: 4,
              backgroundColor: "#1e1e1e",
              border: "1px solid #555",
              pointerEvents: "auto",
            }}
          >
            <CardContent sx={{ padding: "12px 16px !important" }}>
              <div style={{ marginBottom: 8 }}>
                <p style={{ margin: 0, marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                  {currentTask?.message || "Processing..."}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#999" }}>
                  {currentTask?.progress
                    ? `${currentTask.progress.current.toLocaleString()} / ${currentTask.progress.total.toLocaleString()} (${progressPercentage}%)`
                    : "Initializing..."}
                </p>
              </div>
              <LinearProgress variant="determinate" value={progressPercentage} sx={{ height: 4 }} />
            </CardContent>
          </Card>
        </div>
      )}

      <div style={{ width: "100%" }}>
        {/* Select All Banner */}
        {showSelectAllBanner && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              backgroundColor: "#2a2a2a",
              border: "1px solid #555",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 14, color: "#ccc" }}>
              All {selectedRows.length} items on this page are selected.
            </span>
            <Button
              size="small"
              variant="text"
              onClick={handleSelectAllTotal}
              style={{ fontSize: 14, textTransform: "none", padding: "2px 8px" }}
            >
              Select all {total?.toLocaleString()} items
            </Button>
          </div>
        )}

        {/* Action Bar - Export Button */}
        {hasSelection && (
          <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", justifyContent: "flex-end" }}>
            {selectAllTotal && (
              <span style={{ fontSize: 13, color: "#999", marginRight: "auto" }}>
                {deselectedIds.size > 0
                  ? `${getSelectionCount().toLocaleString()} of ${total?.toLocaleString()} selected (${deselectedIds.size} excluded)`
                  : `All ${total?.toLocaleString()} items selected`}
              </span>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={() => setShowExportDialog(true)}
              disabled={isAdding}
              startIcon={isAdding ? <CircularProgress size={16} /> : <FileDownload />}
            >
              {isAdding ? "Exporting..." : `Export (${getSelectionCount().toLocaleString()})`}
            </Button>
          </div>
        )}

      {/* Data Grid */}
      <div style={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={response}
          rowHeight={30}
          columns={[
            { field: "liked", headerName: "Liked", width: 90 },
            { field: "id", headerName: "ID", width: 90 },
            { field: "company_name", headerName: "Company Name", width: 200 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total}
          pagination
          checkboxSelection
          paginationMode="server"
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
            // Clear selection when changing pages in select all mode
            if (selectAllTotal) {
              // Keep selectAllTotal mode but update deselected set for new page
            } else {
              setSelectedRows([]);
            }
          }}
          onRowSelectionModelChange={handleRowSelectionChange}
          rowSelectionModel={
            selectAllTotal
              ? response.filter((r) => !deselectedIds.has(r.id)).map((r) => r.id)
              : selectedRows
          }
        />
      </div>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onClose={() => setShowExportDialog(false)}>
        <DialogTitle>Export to Collection</DialogTitle>
        <DialogContent>
          <p style={{ marginBottom: 16, color: "#ccc" }}>
            Select a collection to export {getSelectionCount().toLocaleString()} companies to:
          </p>
          <Select
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            displayEmpty
            fullWidth
            size="small"
          >
            <MenuItem value="" disabled>
              Select a collection...
            </MenuItem>
            {availableCollections.map((collection) => (
              <MenuItem key={collection.id} value={collection.id}>
                {collection.collection_name}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExportDialog(false)}>Cancel</Button>
          <Button
            onClick={handleExport}
            variant="contained"
            disabled={!targetCollectionId || isAdding}
          >
            {isAdding ? <CircularProgress size={20} /> : "Export"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: "100%",
            border: "1px solid #555",
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
    </>
  );
};

export default CompanyTable;
