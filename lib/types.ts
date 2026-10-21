export type FileMap = Record<string, string>;

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  working_files: FileMap;
  template_version: string;
  revision: number;
  head_version_id: string | null;
  active_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  run_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  steps: string[];
  created_at: string;
}

export interface Version {
  id: string;
  project_id: string;
  number: number;
  summary: string;
  source: "ai" | "manual" | "restore";
  restored_from_id: string | null;
  template_version: string;
  created_at: string;
  files?: FileMap;
}

export type AgentEvent =
  | { type: "run"; id: string }
  | { type: "text"; text: string }
  | { type: "step"; text: string }
  | { type: "done"; project: Project; version: Version | null; message: Message }
  | { type: "error"; message: string };
