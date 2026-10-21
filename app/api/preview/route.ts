import { examples } from "@/lib/templates/examples";
import { demoEnabled } from "@/lib/demo-access";
import { NextResponse } from "next/server";
import {
  readBody,
  errorResponse,
  ApiError,
  authenticated,
} from "@/lib/projects/api";
import { filesSchema } from "@/lib/projects/files";
import { z } from "zod";
import { buildPreview } from "@/lib/projects/preview";

export const runtime = "nodejs";
// In hosted demo mode, only exact bundled examples are public. Custom source requires login.
// Source is size-limited, imports are allowlisted, and never executed here.
export async function POST(request: Request) {
  try {
    const { files: parsed } = z
      .object({ files: filesSchema })
      .parse(await readBody(request));
    const publicExample = examples.some(
      ({ files }) =>
        Object.keys(files).length === Object.keys(parsed).length &&
        Object.entries(files).every(
          ([path, source]) => parsed[path] === source,
        ),
    );
    if (demoEnabled() && !publicExample) await authenticated();
    let html: string;
    try {
      html = await buildPreview(parsed);
    } catch (error) {
      throw new ApiError(
        `预览编译失败：${error instanceof Error ? error.message.slice(0, 500) : "请检查代码"}`,
      );
    }
    return NextResponse.json(
      { html },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
