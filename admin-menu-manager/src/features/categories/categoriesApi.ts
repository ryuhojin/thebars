import type {
  CategoriesResponse,
  CreateCategoryRequest,
  DeleteCategoryRequest,
  MoveCategoryRequest,
  ReorderCategoriesRequest,
  UpdateCategoryRequest
} from "../../../contracts/categories";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readCategories(barId: string): Promise<CategoriesResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/categories`);
}

export async function createCategory(barId: string, payload: CreateCategoryRequest): Promise<CategoriesResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/categories`, payload);
}

export async function updateCategory(
  barId: string,
  categoryId: string,
  payload: UpdateCategoryRequest
): Promise<CategoriesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/categories/${encodeURIComponent(categoryId)}`, payload);
}

export async function moveCategory(barId: string, categoryId: string, payload: MoveCategoryRequest): Promise<CategoriesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/categories/${encodeURIComponent(categoryId)}/move`, payload);
}

export async function reorderCategories(barId: string, payload: ReorderCategoriesRequest): Promise<CategoriesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/categories/reorder`, payload);
}

export async function deleteCategory(
  barId: string,
  categoryId: string,
  payload: DeleteCategoryRequest
): Promise<{ deleted: true }> {
  return deleteJson(`/api/bars/${encodeURIComponent(barId)}/categories/${encodeURIComponent(categoryId)}`, payload);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    credentials: "include"
  });
  return readEnvelope<T>(response);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<T>(response);
}

async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<T>(response);
}

async function deleteJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<T>(response);
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if ("error" in envelope) {
    throw new AuthApiError(
      envelope.error.code,
      envelope.error.message,
      envelope.error.fieldErrors,
      envelope.error.details ?? {}
    );
  }
  return envelope.data;
}

function csrfToken(): string {
  const fromStorage = sessionStorage.getItem("bar_csrf");
  if (fromStorage) return fromStorage;
  const fromCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bar_csrf="));
  return fromCookie ? decodeURIComponent(fromCookie.replace("bar_csrf=", "")) : "";
}
