import { Body, Controller, Get, Param, Put } from "@tsuki-hono/common";
import type { Annotation, AnnotationKind, AnnotationPoint } from "../../../../shared/types.js";
import { ClientError } from "../../errors.js";
import { loadAnnotations, saveAnnotations } from "../../services/annotations.js";

const KINDS: AnnotationKind[] = ["trendline", "hline", "rect", "fib"];

function isValidPoint(point: unknown): point is AnnotationPoint {
  return (
    typeof point === "object" &&
    point !== null &&
    typeof (point as AnnotationPoint).time === "number" &&
    typeof (point as AnnotationPoint).price === "number"
  );
}

function isValidAnnotation(item: unknown): item is Annotation {
  if (typeof item !== "object" || item === null) return false;
  const a = item as Annotation;
  if (typeof a.id !== "string") return false;
  if (!KINDS.includes(a.kind)) return false;
  if (!Array.isArray(a.points) || !a.points.every(isValidPoint)) return false;
  const expectedPoints = a.kind === "hline" ? 1 : 2;
  if (a.points.length !== expectedPoints) return false;
  if (typeof a.createdAt !== "number") return false;
  return true;
}

function parseAnnotations(body: unknown): Annotation[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ClientError("request body must be JSON", 'e.g. {"annotations": []}');
  }
  const annotations = (body as Record<string, unknown>).annotations;
  if (!Array.isArray(annotations)) {
    throw new ClientError("`annotations` must be an array", 'e.g. {"annotations": []}');
  }
  if (!annotations.every(isValidAnnotation)) {
    throw new ClientError(
      "invalid annotation shape",
      "each annotation needs a string id, a valid kind, points with the right count (1 for hline, 2 otherwise), and a numeric createdAt",
    );
  }
  return annotations;
}

@Controller("annotations")
export class AnnotationsController {
  @Get("/:symbol")
  async getAnnotations(@Param("symbol") symbol: string) {
    const data = await loadAnnotations(symbol);
    return { ok: true, data };
  }

  @Put("/:symbol")
  async putAnnotations(@Param("symbol") symbol: string, @Body() body: unknown) {
    const annotations = parseAnnotations(body);
    await saveAnnotations(symbol, annotations);
    return { ok: true, data: { count: annotations.length } };
  }
}
