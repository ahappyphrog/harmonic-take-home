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

      // Get collection names for display
      const sourceCollection = collections.find((c) => c.id === props.selectedCollectionId);
      const targetCollection = collections.find((c) => c.id === targetCollectionId);

      setCurrentTask({
        id: result.task_id,
        status: "pending",
        progress: { current: 0, total: result.estimated_count },
        message: `Exporting ${result.estimated_count.toLocaleString()} companies from "${sourceCollection?.collection_name}" to "${targetCollection?.collection_name}"`,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setShowProgressDialog(true);

      // Show start notification
      setSnackbar({
        open: true,
        message: `Started exporting ${result.estimated_count.toLocaleString()} companies from "${sourceCollection?.collection_name}" to "${targetCollection?.collection_name}"`,
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
              border: "1px solid #333",
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
    </>
  );
};

export default CompanyTable;
