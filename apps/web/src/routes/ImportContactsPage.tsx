import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ImportContactRow, ImportContactsResult } from "@network-crm/contracts";
import { apiPost } from "../api/client.js";
import { ErrorState } from "../components/StatusStates.js";
import { parseCsv } from "../lib/csv.js";

const TARGET_FIELDS = [
  { value: "", label: "— не использовать —" },
  { value: "display_name", label: "Имя (обязательно)" },
  { value: "full_name", label: "Полное имя" },
  { value: "source", label: "Источник" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "external_id", label: "Внешний ID" },
] as const;
type TargetField = (typeof TARGET_FIELDS)[number]["value"];

/** BL-203 (FR-CORE-006): upload -> client-side column mapping -> dry-run preview -> commit. */
export function ImportContactsPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, TargetField>>({});
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "create_anyway">("skip");
  const [dryRunResult, setDryRunResult] = useState<ImportContactsResult | null>(null);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (rows.length === 0) return;
      const [headerRow, ...rest] = rows;
      setHeaders(headerRow!);
      setDataRows(rest.filter((r) => r.some((cell) => cell.trim() !== "")));
      // best-effort auto-map by header name
      const auto: Record<number, TargetField> = {};
      headerRow!.forEach((h, i) => {
        const normalized = h.trim().toLowerCase();
        const match = TARGET_FIELDS.find((f) => f.value !== "" && (f.value === normalized || f.label.toLowerCase().startsWith(normalized)));
        if (match) auto[i] = match.value;
      });
      setMapping(auto);
      setDryRunResult(null);
    };
    reader.readAsText(file);
  }

  const mappedRows = useMemo<ImportContactRow[]>(() => {
    const displayNameCol = Object.entries(mapping).find(([, v]) => v === "display_name")?.[0];
    if (displayNameCol === undefined) return [];
    return dataRows.map((cells) => {
      const row: ImportContactRow = { display_name: "" };
      for (const [colIndexStr, field] of Object.entries(mapping)) {
        if (!field) continue;
        const value = cells[Number(colIndexStr)]?.trim();
        if (!value) continue;
        (row as Record<string, string>)[field] = value;
      }
      return row;
    });
  }, [dataRows, mapping]);

  const hasDisplayNameMapped = Object.values(mapping).includes("display_name");

  const runImport = useMutation({
    mutationFn: (mode: "dry_run" | "commit") =>
      apiPost<ImportContactsResult>("/contacts/import", { mode, on_duplicate: onDuplicate, rows: mappedRows }),
    onSuccess: (result, mode) => {
      if (mode === "dry_run") setDryRunResult(result);
      else setDryRunResult(result);
    },
  });

  return (
    <div className="stack">
      <div>
        <Link to="/contacts">← Контакты</Link>
      </div>
      <h1 style={{ margin: 0 }}>Импорт контактов</h1>

      <div className="card stack">
        <div className="field">
          <label htmlFor="file">CSV-файл</label>
          <input id="file" type="file" accept=".csv,text/csv" onChange={onFileSelected} />
        </div>

        {headers.length > 0 ? (
          <>
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
              Найдено строк: {dataRows.length}. Сопоставьте колонки файла с полями контакта.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Колонка файла</th>
                  <th>Поле контакта</th>
                  <th>Пример</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td>{h || `(колонка ${i + 1})`}</td>
                    <td>
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value as TargetField }))}
                      >
                        {TARGET_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{dataRows[0]?.[i] ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!hasDisplayNameMapped ? (
              <div className="state-banner error">Поле «Имя» обязательно — сопоставьте хотя бы одну колонку с ним.</div>
            ) : null}

            <div className="row">
              <label htmlFor="on_duplicate" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                При найденном дубле:
              </label>
              <select id="on_duplicate" value={onDuplicate} onChange={(e) => setOnDuplicate(e.target.value as typeof onDuplicate)}>
                <option value="skip">Пропустить строку</option>
                <option value="create_anyway">Всё равно создать</option>
              </select>
            </div>

            <div className="row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!hasDisplayNameMapped || runImport.isPending}
                onClick={() => runImport.mutate("dry_run")}
              >
                Проверить (dry-run)
              </button>
              <button
                type="button"
                className="btn"
                disabled={!hasDisplayNameMapped || !dryRunResult || dryRunResult.mode !== "dry_run" || runImport.isPending}
                onClick={() => runImport.mutate("commit")}
              >
                Импортировать
              </button>
            </div>
          </>
        ) : null}

        {runImport.isError ? <ErrorState error={runImport.error} /> : null}

        {dryRunResult ? (
          <div className="stack">
            <div className="row">
              <span className="badge">{dryRunResult.mode === "dry_run" ? "предпросмотр" : "импортировано"}</span>
              <span>всего: {dryRunResult.total}</span>
              <span>создано{dryRunResult.mode === "dry_run" ? " будет" : ""}: {dryRunResult.created}</span>
              <span>дублей пропущено: {dryRunResult.skipped_duplicate}</span>
              <span>ошибок: {dryRunResult.failed}</span>
            </div>
            {dryRunResult.rows.some((r) => r.outcome === "failed") ? (
              <table>
                <thead>
                  <tr>
                    <th>Строка</th>
                    <th>Результат</th>
                    <th>Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRunResult.rows
                    .filter((r) => r.outcome === "failed")
                    .map((r) => (
                      <tr key={r.row_index}>
                        <td>{r.row_index + 1}</td>
                        <td>
                          <span className="badge">{r.outcome}</span>
                        </td>
                        <td>{r.error}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
