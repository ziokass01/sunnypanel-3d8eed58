function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function resolveSupabaseUrl(env) {
  return trimTrailingSlash(
    env?.ACTIVE_SUPABASE_URL || env?.UPSTREAM_SUPABASE_URL || env?.SUPABASE_URL || "",
  );
}

function resolveServiceRoleKey(env) {
  return String(
    env?.SUPABASE_SERVICE_ROLE_KEY || env?.UPSTREAM_SERVICE_ROLE_KEY || "",
  ).trim();
}

function postgrestScalar(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

function postgrestInValue(value) {
  const raw = postgrestScalar(value);
  if (/^[A-Za-z0-9_.:@+\-]+$/.test(raw)) return raw;
  return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function responseError(status, payload, statusText) {
  const message = String(
    payload?.message || payload?.hint || payload?.details || statusText || `HTTP_${status}`,
  ).trim();
  return {
    message: message || `HTTP_${status}`,
    code: payload?.code || `HTTP_${status}`,
    details: payload?.details ?? null,
    hint: payload?.hint ?? null,
    status,
  };
}

async function parseBody(response) {
  if (response.status === 204 || response.status === 205) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class RestQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.operation = "select";
    this.filters = [];
    this.orders = [];
    this.columns = "*";
    this.payload = undefined;
    this.countMode = null;
    this.head = false;
    this.returning = false;
    this.wantMaybeSingle = false;
    this.limitValue = null;
  }

  clone() {
    const q = new RestQuery(this.client, this.table);
    Object.assign(q, this);
    q.filters = [...this.filters];
    q.orders = [...this.orders];
    q.limitValue = this.limitValue;
    return q;
  }

  select(columns = "*", options = {}) {
    this.columns = String(columns || "*");
    if (this.operation === "insert" || this.operation === "update" || this.operation === "delete") {
      this.returning = true;
    } else {
      this.operation = "select";
    }
    if (options?.count) this.countMode = String(options.count);
    if (options?.head === true) this.head = true;
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column, value) {
    this.filters.push([String(column), `eq.${postgrestScalar(value)}`]);
    return this;
  }

  lt(column, value) {
    this.filters.push([String(column), `lt.${postgrestScalar(value)}`]);
    return this;
  }

  lte(column, value) {
    this.filters.push([String(column), `lte.${postgrestScalar(value)}`]);
    return this;
  }

  gt(column, value) {
    this.filters.push([String(column), `gt.${postgrestScalar(value)}`]);
    return this;
  }

  gte(column, value) {
    this.filters.push([String(column), `gte.${postgrestScalar(value)}`]);
    return this;
  }

  is(column, value) {
    this.filters.push([String(column), `is.${value === null ? "null" : postgrestScalar(value)}`]);
    return this;
  }

  in(column, values) {
    const list = Array.isArray(values) ? values : [];
    this.filters.push([String(column), `in.(${list.map(postgrestInValue).join(",")})`]);
    return this;
  }

  or(expression) {
    const raw = String(expression || "").trim();
    if (raw) this.filters.push(["or", `(${raw})`]);
    return this;
  }

  limit(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      this.limitValue = Math.max(1, Math.trunc(parsed));
    }
    return this;
  }

  order(column, options = {}) {
    const direction = options?.ascending === false ? "desc" : "asc";
    this.orders.push(`${String(column)}.${direction}`);
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.execute();
  }

  single() {
    this.wantMaybeSingle = true;
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const url = new URL(`${this.client.url}/rest/v1/${encodeURIComponent(this.table)}`);
    for (const [column, expression] of this.filters) url.searchParams.append(column, expression);
    if (this.operation === "select" || this.returning || this.wantMaybeSingle) {
      if (this.columns) url.searchParams.set("select", this.columns);
    }
    if (this.orders.length) url.searchParams.set("order", this.orders.join(","));
    if (this.limitValue != null) url.searchParams.set("limit", String(this.limitValue));

    const headers = this.client.headers();
    const prefer = [];
    if (this.countMode) prefer.push(`count=${this.countMode}`);
    if (this.operation === "insert" || this.operation === "update" || this.operation === "delete") {
      prefer.push(this.returning || this.wantMaybeSingle ? "return=representation" : "return=minimal");
    }
    if (prefer.length) headers.set("Prefer", prefer.join(","));

    let method = "GET";
    let body;
    if (this.operation === "insert") {
      method = "POST";
      body = JSON.stringify(this.payload ?? {});
    } else if (this.operation === "update") {
      method = "PATCH";
      body = JSON.stringify(this.payload ?? {});
    } else if (this.operation === "delete") {
      method = "DELETE";
    } else if (this.head) {
      method = "HEAD";
    }

    let response;
    try {
      response = await this.client.fetchWithTimeout(url.toString(), { method, headers, body });
    } catch (error) {
      return {
        data: null,
        error: {
          message: String(error?.message ?? error ?? "REST_FETCH_FAILED"),
          code: "REST_FETCH_FAILED",
          status: 0,
        },
        count: null,
      };
    }

    const payload = this.head ? null : await parseBody(response);
    let count = null;
    if (this.countMode) {
      const contentRange = response.headers.get("content-range") || "";
      const match = /\/(\d+|\*)$/.exec(contentRange);
      if (match && match[1] !== "*") count = Number(match[1]);
    }

    if (!response.ok) {
      return {
        data: null,
        error: responseError(response.status, payload, response.statusText),
        count,
      };
    }

    let data = payload;
    if (this.wantMaybeSingle) {
      if (Array.isArray(payload)) {
        if (payload.length === 0) data = null;
        else if (payload.length === 1) data = payload[0];
        else {
          return {
            data: null,
            error: {
              message: "JSON object requested, multiple rows returned",
              code: "PGRST116",
              status: 406,
            },
            count,
          };
        }
      }
    }

    return { data, error: null, count };
  }
}

class ServiceRestClient {
  constructor(url, serviceRoleKey, timeoutMs = 12_000) {
    this.url = url;
    this.serviceRoleKey = serviceRoleKey;
    this.timeoutMs = timeoutMs;
  }

  headers() {
    return new Headers({
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  }

  from(table) {
    return new RestQuery(this, String(table));
  }

  async rpc(functionName, args = {}) {
    const headers = this.headers();
    headers.set("Prefer", "return=representation");
    let response;
    try {
      response = await this.fetchWithTimeout(
        `${this.url}/rest/v1/rpc/${encodeURIComponent(String(functionName))}`,
        { method: "POST", headers, body: JSON.stringify(args ?? {}) },
      );
    } catch (error) {
      return {
        data: null,
        error: {
          message: String(error?.message ?? error ?? "RPC_FETCH_FAILED"),
          code: "RPC_FETCH_FAILED",
          status: 0,
        },
      };
    }
    const payload = await parseBody(response);
    if (!response.ok) return { data: null, error: responseError(response.status, payload, response.statusText) };
    return { data: payload, error: null };
  }

  async fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException("SUPABASE_REST_TIMEOUT", "AbortError")), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createServiceClient(env) {
  const url = resolveSupabaseUrl(env);
  const serviceRoleKey = resolveServiceRoleKey(env);
  if (!url || !serviceRoleKey) return null;
  const timeoutRaw = Number(env?.FREE_NATIVE_DB_TIMEOUT_MS ?? env?.UPSTREAM_TIMEOUT_MS ?? 12_000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1000, Math.min(30_000, Math.trunc(timeoutRaw))) : 12_000;
  return new ServiceRestClient(url, serviceRoleKey, timeoutMs);
}

export function serviceClientReadiness(env) {
  return {
    url: Boolean(resolveSupabaseUrl(env)),
    serviceRoleKey: Boolean(resolveServiceRoleKey(env)),
  };
}
