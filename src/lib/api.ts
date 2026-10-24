export type Health = { service: string; status: string; phase: number; paymentMode: string };

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function apiGet(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, credentials: 'same-origin' });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(response.status, 'The collection could not be loaded. Please try again.');
  }
  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 400
        ? 'These filters are invalid. Clear them or choose a different price range.'
        : 'The collection is temporarily unavailable. Please try again.',
    );
  }
  return body;
}

export async function getHealth(): Promise<Health> {
  const response = await fetch('/api/health', { credentials: 'same-origin' });
  if (!response.ok)
    throw new Error('The API could not be reached. Start the local Worker and try again.');
  const body: { data: Health } = await response.json();
  return body.data;
}
