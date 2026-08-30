import type { KanbnApi } from "./KanbnApi";

type ValidationError = { task: string | null, errors: string };

type DriftItem = {
  task: string,
  column: string,
  field: string,
  issue: "missing" | "unexpected",
  message: string,
  fixable: boolean,
  date: Date | null,
  source: string | null
};

type Warning = { message: string, board?: string, column?: string, task?: string, type?: string };

export type ValidationReport = {
  boardSlug: string,
  boardName: string,
  errors: ValidationError[],
  drift: DriftItem[],
  columnContent: Warning[],
  contributors: Warning[],
  actions: Warning[],
  boards: Warning[],
  // Checks that couldn't run at all, so a single broken one doesn't hide the rest
  failed: Array<{ check: string, message: string }>
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Run every check `kanbn validate` runs, in the same order.
 *
 * Errors and warnings are different things here, exactly as they are on the command line: an error
 * is a file that doesn't parse or a rule that can't run, and it stops the rest; a warning describes
 * a workspace that works, just probably not the way its author meant it to.
 */
export async function validateBoard(
  kanbn: KanbnApi,
  boardSlug: string,
  boardName: string
): Promise<ValidationReport> {
  const report: ValidationReport = {
    boardSlug,
    boardName,
    errors: [],
    drift: [],
    columnContent: [],
    contributors: [],
    actions: [],
    boards: [],
    failed: [],
  };

  // Parse errors and action rule errors. These stop everything else, because the later checks all
  // assume a board that reads
  try {
    const result = await kanbn.validate(false);
    if (result !== true) {
      report.errors = result as unknown as ValidationError[];
      return report;
    }
  } catch (error) {
    report.errors = [{ task: null, errors: message(error) }];
    return report;
  }

  const run = async (check: string, fn: () => Promise<any[]>, into: (values: any[]) => void) => {
    try {
      into(await fn());
    } catch (error) {
      report.failed.push({ check, message: message(error) });
    }
  };

  // findDateDrift, fixDateDrift and findBoardWarnings exist on the Kanbn class but aren't in its
  // type declarations, so they're reached through a cast rather than left out
  await run("dates", () => (kanbn as any).findDateDrift(), (v) => { report.drift = v; });
  await run("column content", () => kanbn.findColumnContentWarnings(), (v) => { report.columnContent = v; });
  await run("contributors", () => kanbn.findContributorWarnings(), (v) => { report.contributors = v; });
  await run("actions", () => kanbn.findActionWarnings(), (v) => { report.actions = v; });

  // A workspace with one board has none of the multi-board problems to have
  let multiBoard = false;
  try {
    multiBoard = (await kanbn.listBoards()).length > 1;
  } catch (error) {
    multiBoard = false;
  }
  if (multiBoard) {
    await run("boards", () => (kanbn as any).findBoardWarnings(), (v) => { report.boards = v; });
  }

  return report;
}

export function countProblems(report: ValidationReport): number {
  return report.errors.length
    + report.drift.length
    + report.columnContent.length
    + report.contributors.length
    + report.actions.length
    + report.boards.length
    + report.failed.length;
}

export function fixableDates(report: ValidationReport): DriftItem[] {
  return report.drift.filter((item) => item.fixable && item.issue === "missing");
}

const section = (title: string, lines: string[]): string[] =>
  lines.length ? ["", `${title} (${lines.length})`, ...lines.map((line) => `  ${line}`)] : [];

export function renderReport(report: ValidationReport): string {
  const lines: string[] = [
    `Kanbn validation — ${report.boardName} (${report.boardSlug})`,
    new Date().toLocaleString(),
  ];

  if (report.errors.length) {
    lines.push(
      ...section("Errors", report.errors.map(
        (error) => `${error.task ? `${error.task}: ` : ""}${error.errors}`
      ))
    );
    lines.push("", "Nothing else was checked, because these have to be fixed first.");
    return lines.join("\n");
  }

  lines.push(
    ...section("Dates that don't match their column", report.drift.map((item) => {
      const how = item.fixable
        ? `can be filled in from ${item.source}`
        : "can't be filled in automatically";
      return `${item.task}: ${item.message} — ${how}`;
    })),
    ...section("Lines in columns that aren't task links", report.columnContent.map(
      (warning) => `${warning.column ? `[${warning.column}] ` : ""}${warning.message}`
    )),
    ...section("Names used in tasks that aren't known contributors", report.contributors.map(
      (warning) => `${warning.task ? `${warning.task}: ` : ""}${warning.message}`
    )),
    ...section("Action rules", report.actions.map((warning) => warning.message)),
    ...section("Boards", report.boards.map(
      (warning) => `${warning.board ? `${warning.board}: ` : ""}${warning.message}`
    )),
    ...section("Checks that couldn't run", report.failed.map(
      (failure) => `${failure.check}: ${failure.message}`
    ))
  );

  if (countProblems(report) === 0) {
    lines.push("", "Everything OK.");
  }

  return lines.join("\n");
}

export function renderFixes(
  fixed: Array<{ task: string, field: string, date: Date, source: string }>
): string {
  if (!fixed.length) {
    return "Nothing to fix.";
  }
  return [
    `Filled in ${fixed.length} missing ${fixed.length === 1 ? "date" : "dates"}:`,
    ...fixed.map((item) => `  ${item.task}: ${item.field} set to ${
      item.date instanceof Date ? item.date.toISOString() : String(item.date)
    } (from ${item.source})`),
  ].join("\n");
}
