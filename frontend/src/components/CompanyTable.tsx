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
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

  // Track multiple concurrent tasks
  interface TaskMetadata {
    task: ITask;
    sourceCollectionId: string;
    targetCollectionId: string;
  }

  const [activeTasks, setActiveTasks] = useState<TaskMetadata[]>(() => {
    const saved = localStorage.getItem("activeTasks");
    return saved ? JSON.parse(saved) : [];
  });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  // Persist active tasks to localStorage
  useEffect(() => {
    if (activeTasks.length > 0) {
      localStorage.setItem("activeTasks", JSON.stringify(activeTasks));
    } else {
      localStorage.removeItem("activeTasks");
    }
  }, [activeTasks]);

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

  // Poll task status for all active tasks
  useEffect(() => {
    if (activeTasks.length === 0) {
      return;
    }

    const pollInterval = setInterval(async () => {
      const updatedTasks: TaskMetadata[] = [];

      for (const taskMeta of activeTasks) {
        try {
          const updatedTask = await getTaskStatus(taskMeta.task.id);

          if (updatedTask.status === "completed") {
            // Show completion notification
            setSnackbar({
              open: true,
              message: updatedTask.message || "Export completed successfully!",
              severity: "success",
            });

            // Refresh the table if this task affects the current collection
            if (
              taskMeta.sourceCollectionId === props.selectedCollectionId ||
              taskMeta.targetCollectionId === props.selectedCollectionId
            ) {
              getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
                (newResponse) => {
                  setResponse(newResponse.companies);
                  setTotal(newResponse.total);
                }
              );
            }
            // Don't add completed tasks to updatedTasks
          } else if (updatedTask.status === "failed") {
            setSnackbar({
              open: true,
              message: updatedTask.error || "Failed to add companies",
              severity: "error",
            });
            // Don't add failed tasks to updatedTasks
          } else {
            // Task is still in progress
            updatedTasks.push({
              ...taskMeta,
              task: updatedTask,
            });
          }
        } catch (error) {
          console.error("Error polling task status:", error);
          // Keep the task in the list if polling failed
          updatedTasks.push(taskMeta);
        }
      }

      setActiveTasks(updatedTasks);
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [activeTasks, props.selectedCollectionId, offset, pageSize]);

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

    // Check for duplicate export (same source and target)
    const isDuplicate = activeTasks.some(
      (t) =>
        t.sourceCollectionId === props.selectedCollectionId &&
        t.targetCollectionId === targetCollectionId
    );

    if (isDuplicate) {
      setSnackbar({
        open: true,
        message: "An export from this collection to the selected destination is already in progress",
        severity: "error",
      });
      setShowExportDialog(false);
      return;
    }

    setIsAdding(true);
    setShowExportDialog(false);

    try {
      if (selectAllTotal) {
        // Use bulk add endpoint
        const result = await bulkAddCompaniesFromCollection(
          targetCollectionId,
          props.selectedCollectionId
        );

        const newTask: TaskMetadata = {
          task: {
            id: result.task_id,
            status: "pending",
            progress: { current: 0, total: result.estimated_count },
            message: "",
            error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          sourceCollectionId: props.selectedCollectionId,
          targetCollectionId: targetCollectionId,
        };

        setActiveTasks([...activeTasks, newTask]);

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

        // Format message with duplicate info
        const successMessage = result.duplicates_count > 0
          ? `Successfully exported ${result.added_count} ${result.added_count === 1 ? 'company' : 'companies'} (${result.duplicates_count} ${result.duplicates_count === 1 ? 'duplicate' : 'duplicates'})`
          : `Successfully exported ${result.added_count} ${result.added_count === 1 ? 'company' : 'companies'}`;

        setSnackbar({
          open: true,
          message: successMessage,
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

  // Get tasks relevant to the current collection
  const relevantTasks = activeTasks.filter(
    (t) =>
      t.sourceCollectionId === props.selectedCollectionId ||
      t.targetCollectionId === props.selectedCollectionId
  );

  const getTaskMessage = (taskMeta: TaskMetadata) => {
    if (taskMeta.sourceCollectionId === props.selectedCollectionId) {
      const targetCollection = collections.find((c) => c.id === taskMeta.targetCollectionId);
      return `Exporting ${taskMeta.task.progress?.total.toLocaleString() || 0} companies to "${targetCollection?.collection_name || 'Unknown'}"`;
    } else {
      const sourceCollection = collections.find((c) => c.id === taskMeta.sourceCollectionId);
      return `Importing ${taskMeta.task.progress?.total.toLocaleString() || 0} companies from "${sourceCollection?.collection_name || 'Unknown'}"`;
    }
  };

  const getProgressPercentage = (task: ITask) => {
    return task.progress
      ? Math.round((task.progress.current / task.progress.total) * 100)
      : 0;
  };

  return (
    <>
      <div style={{ width: "100%" }}>
        {/* Export/Import Status - Show all relevant tasks */}
        {relevantTasks.map((taskMeta) => {
          const progressPercentage = getProgressPercentage(taskMeta.task);
          return (
            <div
              key={taskMeta.task.id}
              style={{
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                backgroundColor: "#2a2a2a",
                border: "1px solid #555",
                borderRadius: 4,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {getTaskMessage(taskMeta)}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#999" }}>
                  {taskMeta.task.progress
                    ? `${taskMeta.task.progress.current.toLocaleString()} / ${taskMeta.task.progress.total.toLocaleString()}`
                    : "Initializing..."}
                </p>
              </div>
              <div style={{ position: "relative", display: "inline-flex" }}>
                {/* Background circle to show track */}
                <CircularProgress
                  variant="determinate"
                  value={100}
                  size={32}
                  thickness={4}
                  sx={{
                    color: "#444",
                    position: "absolute",
                  }}
                />
                {/* Actual progress */}
                <CircularProgress
                  variant="determinate"
                  value={progressPercentage}
                  size={32}
                  thickness={4}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600 }}>
                    {progressPercentage}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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
            whiteSpace: "normal",
            wordBreak: "break-word",
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
