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
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
} from "@mui/material";

const CompanyTable = (props: { selectedCollectionId: string }) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>("");
  const [collections, setCollections] = useState<ICollection[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [currentTask, setCurrentTask] = useState<ITask | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
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
          setSnackbar({
            open: true,
            message: updatedTask.message || "Companies added successfully!",
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

  const handleAddSelected = async () => {
    if (!targetCollectionId || selectedRows.length === 0) return;

    setIsAdding(true);
    try {
      const companyIds = selectedRows.map((id) => Number(id));
      const result = await addCompaniesToCollection(targetCollectionId, companyIds);
      setSnackbar({
        open: true,
        message: `Successfully added ${result.added_count} companies`,
        severity: "success",
      });
      setSelectedRows([]);
      refreshTable();
    } catch (error) {
      setSnackbar({
        open: true,
        message: "Failed to add companies",
        severity: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddAll = async () => {
    if (!targetCollectionId) return;

    setIsAdding(true);
    try {
      const result = await bulkAddCompaniesFromCollection(
        targetCollectionId,
        props.selectedCollectionId
      );
      setCurrentTask({
        id: result.task_id,
        status: "pending",
        progress: { current: 0, total: result.estimated_count },
        message: "Starting bulk add...",
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setShowProgressDialog(true);
      setSnackbar({
        open: true,
        message: `Adding ${result.estimated_count} companies in background...`,
        severity: "info",
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: "Failed to start bulk add",
        severity: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const availableCollections = collections.filter(
    (c) => c.id !== props.selectedCollectionId
  );

  const progressPercentage = currentTask?.progress
    ? Math.round((currentTask.progress.current / currentTask.progress.total) * 100)
    : 0;

  return (
    <div style={{ width: "100%" }}>
      {/* Action Bar */}
      <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#999" }}>Add to collection:</span>
        <Select
          value={targetCollectionId}
          onChange={(e) => setTargetCollectionId(e.target.value)}
          displayEmpty
          size="small"
          style={{ minWidth: 200 }}
          disabled={isAdding}
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
        <Button
          variant="contained"
          size="small"
          onClick={handleAddSelected}
          disabled={!targetCollectionId || selectedRows.length === 0 || isAdding}
        >
          {isAdding ? <CircularProgress size={20} /> : `Add Selected (${selectedRows.length})`}
        </Button>
        <Button
          variant="contained"
          size="small"
          color="secondary"
          onClick={handleAddAll}
          disabled={!targetCollectionId || isAdding}
        >
          {isAdding ? <CircularProgress size={20} /> : `Add All (${total || 0})`}
        </Button>
      </div>

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
          }}
          onRowSelectionModelChange={(newSelection) => {
            setSelectedRows(newSelection);
          }}
          rowSelectionModel={selectedRows}
        />
      </div>

      {/* Progress Dialog */}
      <Dialog open={showProgressDialog} onClose={() => {}}>
        <DialogTitle>Adding Companies</DialogTitle>
        <DialogContent style={{ minWidth: 400, paddingTop: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: 0, marginBottom: 8 }}>
              {currentTask?.message || "Processing..."}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: "#999" }}>
              {currentTask?.progress
                ? `${currentTask.progress.current.toLocaleString()} / ${currentTask.progress.total.toLocaleString()} companies`
                : "Initializing..."}
            </p>
          </div>
          <LinearProgress variant="determinate" value={progressPercentage} />
          <p style={{ marginTop: 8, fontSize: 12, color: "#999", textAlign: "center" }}>
            {progressPercentage}%
          </p>
        </DialogContent>
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
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default CompanyTable;
