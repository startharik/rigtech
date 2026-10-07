"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderPlus,
  Globe2,
  LockKeyhole,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type DocumentFolder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
};

type WorkspaceDocument = {
  id: string;
  file_name: string;
  storage_path: string;
  folder_id: string | null;
  project_id: string | null;
  visible_to_all: boolean;
  uploaded_by: string;
  mime_type: string | null;
  file_size: number;
  created_at: string;
};

type DocumentProject = { id: string; name: string };
type DocumentShareRecipient = { user_id: string; display_name: string; email: string | null };
type DocumentAccessMode = "private" | "selected" | "everyone";
type DocumentRole = "admin" | "manager" | "supervisor" | "employee" | "client";
type DocumentMessage = { kind: "error" | "success"; text: string };

const documentFields = "id, file_name, storage_path, folder_id, project_id, visible_to_all, uploaded_by, mime_type, file_size, created_at";
const maxFileSize = 50 * 1024 * 1024;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDocumentDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));

const safeFileName = (value: string) =>
  value.normalize("NFKC").replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "_").slice(0, 180) || "document";

export default function DocumentManagement({
  organizationId,
  role,
  canManageOverride,
  canDeleteAnyOverride,
  projects,
}: {
  organizationId: string;
  role: DocumentRole | null;
  canManageOverride?: boolean;
  canDeleteAnyOverride?: boolean;
  projects: DocumentProject[];
}) {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [message, setMessage] = useState<DocumentMessage | null>(null);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), message.kind === "error" ? 6000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploadAccessMode, setUploadAccessMode] = useState<DocumentAccessMode>("private");
  const [uploadShareUserIds, setUploadShareUserIds] = useState<string[]>([]);
  const [shareRecipients, setShareRecipients] = useState<DocumentShareRecipient[]>([]);
  const [sharedUserIdsByDocument, setSharedUserIdsByDocument] = useState<Record<string, string[]>>({});
  const [sharingDocument, setSharingDocument] = useState<WorkspaceDocument | null>(null);
  const [draftAccessMode, setDraftAccessMode] = useState<DocumentAccessMode>("private");
  const [draftShareUserIds, setDraftShareUserIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const canManage = canManageOverride ?? (role === "admin" || role === "manager" || role === "supervisor");
  const canDeleteAny = canDeleteAnyOverride ?? (role === "admin" || role === "manager" || role === "supervisor");

  const loadDocuments = useCallback(async () => {
    try {
      const [folderResult, documentResult] = await Promise.all([
        supabase.from("document_folders").select("id, name, parent_folder_id").eq("organization_id", organizationId).order("name"),
        supabase.from("workspace_documents").select(documentFields).eq("organization_id", organizationId).order("created_at", { ascending: false }),
      ]);
      if (folderResult.error || documentResult.error) {
        setMessage({ kind: "error", text: `Unable to load documents: ${folderResult.error?.message ?? documentResult.error?.message}` });
        return false;
      }
      const sharesResult = await supabase.from("workspace_document_shares").select("document_id, user_id").eq("organization_id", organizationId);
      if (sharesResult.error) {
        setMessage({ kind: "error", text: `Unable to load document sharing details: ${sharesResult.error.message}` });
        return false;
      }
      setFolders((folderResult.data ?? []) as DocumentFolder[]);
      setDocuments((documentResult.data ?? []) as WorkspaceDocument[]);
      const sharesByDocument: Record<string, string[]> = {};
      (sharesResult.data ?? []).forEach((share) => {
        sharesByDocument[share.document_id] = [...(sharesByDocument[share.document_id] ?? []), share.user_id];
      });
      setSharedUserIdsByDocument(sharesByDocument);
      return true;
    } catch (error) {
      setMessage({ kind: "error", text: `Unable to load documents: ${error instanceof Error ? error.message : "Unexpected network error."}` });
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userError) {
          setMessage({ kind: "error", text: `Unable to identify the current user: ${userError.message}` });
          return;
        }
        setCurrentUserId(userResult.user?.id ?? null);
        if (!canManage) return;
        const { data, error } = await supabase.rpc("list_workspace_document_share_recipients", {
          target_organization_id: organizationId,
        });
        if (cancelled) return;
        if (error) {
          setMessage({ kind: "error", text: `Unable to load people to share with: ${error.message}` });
          return;
        }
        setShareRecipients((data ?? []) as DocumentShareRecipient[]);
      } catch (error) {
        if (!cancelled) {
          setMessage({ kind: "error", text: `Unable to load document-sharing access: ${error instanceof Error ? error.message : "Unexpected network error."}` });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, organizationId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadDocuments();
    });
    return () => {
      cancelled = true;
    };
  }, [loadDocuments]);

  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const breadcrumbs = useMemo(() => {
    const path: DocumentFolder[] = [];
    let folderId = currentFolderId;
    while (folderId) {
      const folder = foldersById.get(folderId);
      if (!folder) break;
      path.unshift(folder);
      folderId = folder.parent_folder_id;
    }
    return path;
  }, [currentFolderId, foldersById]);

  const visibleFolders = folders.filter((folder) => folder.parent_folder_id === currentFolderId);
  const visibleDocuments = documents.filter((document) => {
    if (document.folder_id !== currentFolderId) return false;
    if (projectFilter === "unlinked" && document.project_id) return false;
    if (projectFilter && projectFilter !== "unlinked" && document.project_id !== projectFilter) return false;
    const query = searchTerm.trim().toLowerCase();
    return !query || `${document.file_name} ${projectsById.get(document.project_id ?? "") ?? ""}`.toLowerCase().includes(query);
  });

  const handleCreateFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setMessage(null);
    const { data, error } = await supabase.from("document_folders").insert({
      organization_id: organizationId,
      name,
      parent_folder_id: currentFolderId,
    }).select("id, name, parent_folder_id").single();
    if (error || !data) {
      setMessage({ kind: "error", text: `Unable to create folder: ${error?.message ?? "No folder was returned by the database."}` });
    } else {
      setFolders((current) => [...current, data as DocumentFolder].sort((a, b) => a.name.localeCompare(b.name)));
      setFolderName("");
      setShowCreateFolder(false);
      setMessage({ kind: "success", text: "Folder created." });
    }
    setCreatingFolder(false);
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFiles.length) {
      setMessage({ kind: "error", text: "Choose at least one file to upload." });
      return;
    }
    const oversizedFiles = selectedFiles.filter((file) => file.size > maxFileSize);
    if (oversizedFiles.length) {
      setMessage({ kind: "error", text: `Each file must be 50 MB or smaller. Too large: ${oversizedFiles.map((file) => file.name).join(", ")}` });
      return;
    }
    if (uploadAccessMode === "selected" && uploadShareUserIds.length === 0) {
      setMessage({ kind: "error", text: "Choose at least one person, or change access to Private or Everyone." });
      return;
    }

    setUploadBusy(true);
    setMessage(null);
    const failures: string[] = [];
    let uploadedCount = 0;
    try {
    for (const file of selectedFiles) {
      const documentId = crypto.randomUUID();
      const storagePath = `${organizationId}/${documentId}/${safeFileName(file.name)}`;
      const { error: insertError } = await supabase.from("workspace_documents").insert({
        id: documentId,
        organization_id: organizationId,
        file_name: file.name,
        storage_path: storagePath,
        folder_id: currentFolderId,
        project_id: uploadProjectId || null,
        mime_type: file.type || null,
        file_size: file.size,
      });
      if (insertError) {
        failures.push(`${file.name}: ${insertError.message}`);
        continue;
      }

      const { error: sharingError } = await supabase.rpc("set_workspace_document_shares", {
        target_document_id: documentId,
        target_user_ids: uploadAccessMode === "selected" ? uploadShareUserIds : [],
        make_visible_to_all: uploadAccessMode === "everyone",
      });
      if (sharingError) {
        const { error: cleanupError } = await supabase.from("workspace_documents").delete().eq("id", documentId);
        failures.push(`${file.name}: Unable to set sharing: ${sharingError.message}${cleanupError ? ` Metadata cleanup also failed: ${cleanupError.message}` : ""}`);
        continue;
      }

      const { error: uploadError } = await supabase.storage.from("workspace-documents").upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) {
        const { error: cleanupError } = await supabase.from("workspace_documents").delete().eq("id", documentId);
        failures.push(`${file.name}: ${uploadError.message}${cleanupError ? ` Metadata cleanup also failed: ${cleanupError.message}` : ""}`);
        continue;
      }
      uploadedCount += 1;
    }

    setSelectedFiles([]);
    setUploadAccessMode("private");
    setUploadShareUserIds([]);
    const fileInput = document.getElementById("document-upload-input");
    if (fileInput instanceof HTMLInputElement) fileInput.value = "";
    await loadDocuments();
    if (failures.length) {
      setMessage({
        kind: "error",
        text: `${uploadedCount ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded. ` : ""}${failures.join(" · ")}`,
      });
    } else {
      setMessage({ kind: "success", text: `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.` });
    }
    if (uploadedCount) setShowUploadForm(false);
    } catch (error) {
      setMessage({
        kind: "error",
        text: `${uploadedCount ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded before an error. ` : ""}Unable to finish upload: ${error instanceof Error ? error.message : "Unexpected network error."}`,
      });
    } finally {
      setUploadBusy(false);
    }
  };

  const handleProjectChange = async (item: WorkspaceDocument, projectId: string) => {
    setMessage(null);
    const { data, error } = await supabase.from("workspace_documents").update({
      project_id: projectId || null,
    }).eq("id", item.id).select(documentFields).single();
    if (error || !data) {
      setMessage({ kind: "error", text: `Unable to update project tag: ${error?.message ?? "No document was returned by the database."}` });
      return;
    }
    setDocuments((current) => current.map((document) => document.id === item.id ? data as WorkspaceDocument : document));
  };

  const openSharing = (item: WorkspaceDocument) => {
    const sharedUserIds = sharedUserIdsByDocument[item.id] ?? [];
    setSharingDocument(item);
    setDraftAccessMode(item.visible_to_all ? "everyone" : sharedUserIds.length ? "selected" : "private");
    setDraftShareUserIds(sharedUserIds);
  };

  const handleSaveSharing = async () => {
    if (!sharingDocument) return;
    if (draftAccessMode === "selected" && draftShareUserIds.length === 0) {
      setMessage({ kind: "error", text: "Choose at least one person, or change access to Private or Everyone." });
      return;
    }
    setMessage(null);
    setShareBusy(true);
    try {
      const { error } = await supabase.rpc("set_workspace_document_shares", {
        target_document_id: sharingDocument.id,
        target_user_ids: draftAccessMode === "selected" ? draftShareUserIds : [],
        make_visible_to_all: draftAccessMode === "everyone",
      });
      if (error) {
        setMessage({ kind: "error", text: `Unable to update document access: ${error.message}` });
        return;
      }
      setDocuments((current) => current.map((document) => document.id === sharingDocument.id
        ? { ...document, visible_to_all: draftAccessMode === "everyone" }
        : document));
      setSharedUserIdsByDocument((current) => ({
        ...current,
        [sharingDocument.id]: draftAccessMode === "selected" ? draftShareUserIds : [],
      }));
      setSharingDocument(null);
      setMessage({ kind: "success", text: "Document access updated." });
    } catch (error) {
      setMessage({ kind: "error", text: `Unable to update document access: ${error instanceof Error ? error.message : "Unexpected network error."}` });
    } finally {
      setShareBusy(false);
    }
  };

  const handleDownload = async (item: WorkspaceDocument) => {
    setMessage(null);
    const { data, error } = await supabase.storage.from("workspace-documents").createSignedUrl(item.storage_path, 60);
    if (error || !data?.signedUrl) {
      setMessage({ kind: "error", text: `Unable to download ${item.file_name}: ${error?.message ?? "No download link was returned."}` });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (item: WorkspaceDocument) => {
    if (!window.confirm(`Delete “${item.file_name}”? This cannot be undone.`)) return;
    setMessage(null);
    const { error: storageError } = await supabase.storage.from("workspace-documents").remove([item.storage_path]);
    if (storageError) {
      setMessage({ kind: "error", text: `Unable to delete file: ${storageError.message}` });
      return;
    }
    const { error: rowError } = await supabase.from("workspace_documents").delete().eq("id", item.id);
    if (rowError) {
      setMessage({ kind: "error", text: `The file was removed, but its document record could not be deleted: ${rowError.message}` });
      return;
    }
    setDocuments((current) => current.filter((document) => document.id !== item.id));
    setMessage({ kind: "success", text: "Document deleted." });
  };

  const renderAccessControls = (
    mode: DocumentAccessMode,
    selectedUserIds: string[],
    onModeChange: (nextMode: DocumentAccessMode) => void,
    onUsersChange: (nextUserIds: string[]) => void,
    idPrefix: string,
  ) => (
    <fieldset className="mt-4">
      <legend className="text-xs font-semibold text-slate-700">Who can access this document?</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {([
          ["private", "Private", "Only you"],
          ["selected", "Specific people", "Choose people"],
          ["everyone", "Everyone", "All organization members"],
        ] as const).map(([value, label, detail]) => (
          <label key={value} className={`flex min-h-12 cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs ${mode === value ? "border-sky-400 bg-sky-50 text-sky-950" : "border-slate-200 bg-white text-slate-700"}`}>
            <input type="radio" name={`${idPrefix}-access`} value={value} checked={mode === value} onChange={() => onModeChange(value)} className="mt-0.5 h-4 w-4 accent-sky-700" />
            <span><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-slate-500">{detail}</span></span>
          </label>
        ))}
      </div>
      {mode === "selected" && (
        <div role="group" aria-label="People who can access this document" className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
          {shareRecipients.length ? shareRecipients.map((recipient) => (
            <label key={recipient.user_id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedUserIds.includes(recipient.user_id)}
                onChange={(event) => onUsersChange(event.target.checked
                  ? [...selectedUserIds, recipient.user_id]
                  : selectedUserIds.filter((userId) => userId !== recipient.user_id))}
                className="h-4 w-4 accent-sky-700"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{recipient.display_name}</span>
                {recipient.email && <span className="block truncate text-xs text-slate-500">{recipient.email}</span>}
              </span>
            </label>
          )) : <p className="px-2 py-3 text-sm text-slate-500">No other organization members are available.</p>}
        </div>
      )}
    </fieldset>
  );
  const getAccessLabel = (item: WorkspaceDocument) => {
    if (item.visible_to_all) return "Everyone";
    const shareCount = sharedUserIdsByDocument[item.id]?.length ?? 0;
    if (shareCount) return `Shared with ${shareCount}`;
    return item.uploaded_by === currentUserId ? "Private" : "Shared with you";
  };

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sky-700">Workspace files</div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-900 sm:text-4xl">Documents</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Keep project files and shared documents organized in secure workspace folders.</p>
        </div>
        {canManage && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setMessage(null); setShowCreateFolder((current) => !current); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-sky-300"><FolderPlus className="h-4 w-4" /> New folder</button>
          <button type="button" onClick={() => { setMessage(null); setShowUploadForm((current) => !current); }} aria-expanded={showUploadForm} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Upload className="h-4 w-4" /> {showUploadForm ? "Close upload" : "Upload files"}</button>
        </div>}
      </div>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={`fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-[70] mx-auto max-w-lg rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur sm:left-auto sm:right-6 sm:top-5 ${message.kind === "error" ? "border-rose-200 bg-rose-50/95 text-rose-800" : "border-emerald-200 bg-emerald-50/95 text-emerald-800"}`}>
          <span className="break-words">{message.text}</span>
        </div>
      )}

      {canManage && showCreateFolder && (
        <form onSubmit={handleCreateFolder} className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row">
          <input value={folderName} onChange={(event) => setFolderName(event.target.value)} required maxLength={80} placeholder="Folder name" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />
          <button type="submit" disabled={creatingFolder} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{creatingFolder ? "Creating…" : "Create folder"}</button>
          <button type="button" onClick={() => { setShowCreateFolder(false); setFolderName(""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>
        </form>
      )}

      {canManage && showUploadForm && <form onSubmit={handleUpload} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.65fr)_auto] md:items-end">
          <label className="text-xs font-semibold text-slate-600">Choose files <span className="font-normal text-slate-400">Up to 50 MB each</span>
            <input id="document-upload-input" type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Project tag <span className="font-normal text-slate-400">Optional</span>
            <select value={uploadProjectId} onChange={(event) => setUploadProjectId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-sky-400"><option value="">No project — shared document</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </label>
          <button type="submit" disabled={uploadBusy || !selectedFiles.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-4 w-4" /> {uploadBusy ? "Uploading…" : `Upload${selectedFiles.length ? ` ${selectedFiles.length}` : ""}`}</button>
        </div>
        {renderAccessControls(uploadAccessMode, uploadShareUserIds, setUploadAccessMode, setUploadShareUserIds, "upload")}
        {selectedFiles.length > 0 && <div className="mt-2 text-xs text-slate-500">{selectedFiles.map((file) => file.name).join(", ")}</div>}
      </form>}

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Document folders" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => setCurrentFolderId(null)} className={`rounded-lg px-2 py-1.5 font-semibold ${currentFolderId ? "text-slate-500 hover:bg-slate-100" : "text-slate-900"}`}>All documents</button>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="inline-flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <button type="button" onClick={() => setCurrentFolderId(folder.id)} className={`max-w-36 truncate rounded-lg px-2 py-1.5 font-semibold ${folder.id === currentFolderId ? "text-slate-900" : "text-slate-500 hover:bg-slate-100"}`}>{folder.name}</button>
            </span>
          ))}
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter documents by project" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"><option value="">All project tags</option><option value="unlinked">No project tag</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <label className="relative block sm:w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search files" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400" />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">Loading documents…</div>
      ) : visibleFolders.length || visibleDocuments.length ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visibleFolders.length > 0 && (
            <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleFolders.map((folder) => (
                <button key={folder.id} type="button" onClick={() => setCurrentFolderId(folder.id)} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50">
                  <Folder className="h-5 w-5 shrink-0 text-sky-600" />
                  <span className="truncate text-sm font-semibold text-slate-800">{folder.name}</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
          {visibleDocuments.length > 0 && (
            <>
            <div className="divide-y divide-slate-100 md:hidden">
              {visibleDocuments.map((item) => (
                <article key={item.id} className="p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-sm font-semibold text-slate-900">{item.file_name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{formatFileSize(Number(item.file_size))}</span><span aria-hidden="true">·</span><span>{formatDocumentDate(item.created_at)}</span>
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${item.visible_to_all ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {item.visible_to_all ? <Globe2 className="h-3 w-3" /> : item.uploaded_by === currentUserId && !(sharedUserIdsByDocument[item.id]?.length) ? <LockKeyhole className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      {getAccessLabel(item)}
                    </span>
                  </div>
                  <div className="mt-3">
                    {canManage
                      ? <select value={item.project_id ?? ""} onChange={(event) => void handleProjectChange(item, event.target.value)} aria-label={`Project tag for ${item.file_name}`} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"><option value="">No project tag</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                      : <span className="text-xs text-slate-500">{projectsById.get(item.project_id ?? "") ?? "No project tag"}</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void handleDownload(item)} aria-label={`Download ${item.file_name}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white"><ArrowDownToLine className="h-4 w-4" /> Download</button>
                    {canManage && item.uploaded_by === currentUserId && <button type="button" onClick={() => openSharing(item)} aria-label={`Manage access for ${item.file_name}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700"><Users className="h-4 w-4" /><span>Access</span></button>}
                    {canDeleteAny && <button type="button" onClick={() => void handleDelete(item)} aria-label={`Delete ${item.file_name}`} className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-rose-100 text-rose-700"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDocuments.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="max-w-sm px-4 py-3"><div className="flex min-w-0 items-center gap-2.5"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate font-semibold text-slate-900" title={item.file_name}>{item.file_name}</span></div></td>
                      <td className="px-4 py-3">{canManage ? <select value={item.project_id ?? ""} onChange={(event) => void handleProjectChange(item, event.target.value)} aria-label={`Project tag for ${item.file_name}`} className="max-w-52 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-400"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select> : projectsById.get(item.project_id ?? "") ?? "No project"}</td>
                      <td className="px-4 py-3"><span className="text-xs font-semibold text-slate-600">{getAccessLabel(item)}</span>{canManage && item.uploaded_by === currentUserId && <button type="button" onClick={() => openSharing(item)} className="ml-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700"><Users className="h-3.5 w-3.5" />Manage</button>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatFileSize(Number(item.file_size))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDocumentDate(item.created_at)}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1">
                        <button type="button" onClick={() => void handleDownload(item)} aria-label={`Download ${item.file_name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700"><ArrowDownToLine className="h-3.5 w-3.5" /> Download</button>
                        {(canDeleteAny) && <button type="button" onClick={() => void handleDelete(item)} aria-label={`Delete ${item.file_name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><File className="h-6 w-6" /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">No documents here yet</h2>
          <p className="mt-1 text-sm text-slate-500">{searchTerm || projectFilter ? "Try a different search or project filter." : "Upload a file or create a folder to start organizing workspace documents."}</p>
        </div>
      )}
      {sharingDocument && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="document-access-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="document-access-title" className="text-lg font-bold text-slate-950">Document access</h2>
                <p className="mt-1 break-words text-sm text-slate-500">{sharingDocument.file_name}</p>
              </div>
              <button type="button" onClick={() => setSharingDocument(null)} aria-label="Close document access" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {renderAccessControls(draftAccessMode, draftShareUserIds, setDraftAccessMode, setDraftShareUserIds, "document")}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setSharingDocument(null)} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={() => void handleSaveSharing()} disabled={shareBusy} className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60">{shareBusy ? "Saving…" : "Save access"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
