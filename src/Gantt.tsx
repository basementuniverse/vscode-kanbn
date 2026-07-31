import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import formatDate from 'dateformat';
import { paramCase } from '@basementuniverse/kanbn/src/utility';
import { debounce } from 'throttle-debounce';
import VSCodeApi from './VSCodeApi';

type GanttTask = {
  id: string,
  name: string,
  column: string,
  dependencies: string[],
  start: string,
  end: string,
  due?: string | false,
  plannedStart?: string | false,
  plannedFinish?: string | false,
  metadata?: {
    due?: string | Date,
    plannedStart?: string | Date,
    plannedFinish?: string | Date,
  },
  relations?: Array<{
    type?: string,
    task?: string,
  }>,
  externalIncomingDependencies?: string[],
  externalOutgoingDependents?: string[],
  started?: string | false,
  completed?: string | false,
  blocked?: boolean,
};

type GanttData = {
  from: string | null,
  to: string | null,
  dependencyCycleDetected: boolean,
  dependencyCycleTaskIds: string[],
  cycleFallbackTaskIds: string[],
  tasks: GanttTask[],
};

const LABEL_WIDTH = 240;
const ROW_HEIGHT = 34;
const MIN_PIXELS_PER_DAY = 24;
const GANTT_BAR_TOP = 4;
const GANTT_BAR_HEIGHT = 26;
const FORWARD_MIN_HORIZONTAL_TRAVEL = 20;
const NON_FORWARD_DETOUR_GAP = 18;
const TARGET_TOP_APPROACH_GAP = 12;
const INTERACTION_EDGE_THRESHOLD = 7;
const MIN_BAR_PIXEL_WIDTH = 14;
const DRAG_START_THRESHOLD = 2;
const EXTERNAL_TRAIL_LENGTH = 16;

const toTime = (value: string | Date | null | undefined): number => {
  if (!value) {
    return NaN;
  }
  return Date.parse(value instanceof Date ? value.toISOString() : value);
};

const hasDate = (value: string | false | undefined): boolean => {
  if (!value) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value);

type CardinalDirection = 'n' | 'e' | 's' | 'w';

type Point = {
  x: number,
  y: number,
};

type Rect = {
  left: number,
  right: number,
  top: number,
  bottom: number,
  centerX: number,
  centerY: number,
};

type TaskRect = {
  id: string,
  index: number,
  rect: Rect,
};

const rectEqual = (a: Rect, b: Rect): boolean => {
  return a.left === b.left
    && a.right === b.right
    && a.top === b.top
    && a.bottom === b.bottom
    && a.centerX === b.centerX
    && a.centerY === b.centerY;
};

const rectMapEqual = (a: Map<string, Rect>, b: Map<string, Rect>): boolean => {
  if (a.size !== b.size) {
    return false;
  }

  let isEqual = true;
  a.forEach((aRect, key) => {
    const bRect = b.get(key);
    if (!bRect || !rectEqual(aRect, bRect)) {
      isEqual = false;
    }
  });

  return isEqual;
};

const anchorOnRectCenterEdge = (rect: Rect, side: CardinalDirection): Point => {
  const centerX = round((rect.left + rect.right) / 2);
  const centerY = round((rect.top + rect.bottom) / 2);

  if (side === 'e') {
    return {
      x: rect.right,
      y: centerY,
    };
  }

  if (side === 'w') {
    return {
      x: rect.left,
      y: centerY,
    };
  }

  if (side === 'n') {
    return {
      x: centerX,
      y: rect.top,
    };
  }

  return {
    x: centerX,
    y: rect.bottom,
  };
};

const pointsEqual = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

const pointsToPath = (points: Point[]): string => {
  if (points.length === 0) {
    return '';
  }

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    if (!pointsEqual(previous, current)) {
      commands.push(`L ${current.x} ${current.y}`);
    }
  }

  return commands.join(' ');
};

type DependencyPath = {
  key: string,
  path: string,
  isNonForward: boolean,
  isBlocks: boolean,
  isExternal: boolean,
  trailPath?: string,
  ellipsis?: Point,
};

type DragMode = 'drag' | 'resize-left' | 'resize-right';

type DragIntent = DragMode | null;

type DraftSchedule = {
  startMs: number,
  endMs: number,
};

type ActiveInteraction = {
  taskId: string,
  mode: DragMode,
  startClientX: number,
  initialStartMs: number,
  initialEndMs: number,
  didMove: boolean,
};

const normaliseRelationType = (type: string | undefined): string => {
  if (!type) {
    return '';
  }

  return type.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-').trim();
};

const hasBlocksRelation = (sourceTask: GanttTask, targetTaskId: string): boolean => {
  return (sourceTask.relations || []).some((relation) => {
    return relation && relation.task === targetTaskId && normaliseRelationType(relation.type) === 'blocks';
  });
};

const buildSimpleDependencyPath = (sourceRect: Rect, targetRect: Rect): { path: string, isNonForward: boolean } | null => {
  const sourceAnchor = anchorOnRectCenterEdge(sourceRect, 'e');
  const targetAnchor = anchorOnRectCenterEdge(targetRect, 'n');

  const horizontalDelta = targetAnchor.x - sourceAnchor.x;
  const verticalDelta = targetAnchor.y - sourceAnchor.y;
  const canUseForwardRoute = horizontalDelta >= FORWARD_MIN_HORIZONTAL_TRAVEL && verticalDelta >= 0;

  if (canUseForwardRoute) {
    const points = [
      sourceAnchor,
      { x: targetAnchor.x, y: sourceAnchor.y },
      targetAnchor,
    ];
    const path = pointsToPath(points);
    return path ? { path, isNonForward: false } : null;
  }

  const detourX = sourceAnchor.x + NON_FORWARD_DETOUR_GAP;
  const approachY = round(Math.max(0, targetAnchor.y - TARGET_TOP_APPROACH_GAP));
  const approachPoint = {
    x: targetAnchor.x,
    y: approachY < targetAnchor.y ? approachY : targetAnchor.y - 1,
  };

  const points = [
    sourceAnchor,
    { x: detourX, y: sourceAnchor.y },
    { x: detourX, y: approachPoint.y },
    approachPoint,
    targetAnchor,
  ];

  const path = pointsToPath(points);
  return path ? { path, isNonForward: true } : null;
};

const buildExternalIncomingDependencyPath = (targetRect: Rect): { path: string, trailPath: string, ellipsis: Point } | null => {
  const targetAnchor = anchorOnRectCenterEdge(targetRect, 'w');
  const sourceAnchor = {
    x: 0,
    y: targetAnchor.y,
  };
  const bendX = Math.max(sourceAnchor.x + EXTERNAL_TRAIL_LENGTH, targetAnchor.x - 12);

  const points = [
    sourceAnchor,
    { x: bendX, y: sourceAnchor.y },
    targetAnchor,
  ];
  const path = pointsToPath(points);
  const trailPath = pointsToPath([
    sourceAnchor,
    { x: Math.min(targetAnchor.x, sourceAnchor.x + EXTERNAL_TRAIL_LENGTH), y: sourceAnchor.y },
  ]);

  if (!path || !trailPath) {
    return null;
  }

  return {
    path,
    trailPath,
    ellipsis: {
      x: sourceAnchor.x + 1,
      y: sourceAnchor.y - 4,
    },
  };
};

const buildExternalOutgoingDependencyPath = (sourceRect: Rect, timelineWidth: number): { path: string, trailPath: string, ellipsis: Point } | null => {
  const sourceAnchor = anchorOnRectCenterEdge(sourceRect, 'e');
  const targetAnchor = {
    x: timelineWidth,
    y: sourceAnchor.y,
  };

  const path = pointsToPath([
    sourceAnchor,
    targetAnchor,
  ]);
  const trailPath = pointsToPath([
    sourceAnchor,
    { x: Math.min(timelineWidth, sourceAnchor.x + EXTERNAL_TRAIL_LENGTH), y: sourceAnchor.y },
  ]);

  if (!path || !trailPath) {
    return null;
  }

  return {
    path,
    trailPath,
    ellipsis: {
      x: sourceAnchor.x + 2,
      y: sourceAnchor.y - 4,
    },
  };
};

const getXAxisPlacements = (fromMs: number, toMs: number, width: number, dateFormat: string) => {
  const safeWidth = Math.max(1, width);
  const maxLabels = Math.max(2, Math.min(8, Math.floor(safeWidth / 120) + 1));

  for (let count = maxLabels; count >= 2; count--) {
    const placements: { x: number, label: string, start: number, end: number }[] = [];
    let previousEnd = -1;

    for (let i = 0; i < count; i++) {
      const ratio = count === 1 ? 0 : i / (count - 1);
      const x = ratio * safeWidth;
      const date = new Date(fromMs + Math.round((toMs - fromMs) * ratio));
      const label = formatDate(date, dateFormat);
      const halfLabelWidth = Math.round(label.length * 3.5);
      let start = Math.round(x - halfLabelWidth);
      if (start < 0) {
        start = 0;
      }
      let end = start + halfLabelWidth * 2;
      if (end >= safeWidth) {
        end = safeWidth - 1;
        start = Math.max(0, end - halfLabelWidth * 2);
      }

      if (i > 0 && start <= previousEnd + 8) {
        placements.length = 0;
        break;
      }

      placements.push({ x, label, start, end });
      previousEnd = end;
    }

    if (placements.length > 0) {
      return placements;
    }
  }

  return [{ x: 0, label: formatDate(new Date(fromMs), dateFormat), start: 0, end: 0 }];
};

const toIso = (valueMs: number): string => new Date(valueMs).toISOString();

const parsePlannedTime = (task: GanttTask, field: 'plannedStart' | 'plannedFinish'): number => {
  if (task.metadata && task.metadata[field]) {
    return toTime(task.metadata[field] || null);
  }
  return toTime(task[field] || null);
};

const toColumnClassName = (columnName: string): string => `kanbn-column-${paramCase(columnName)}`;

const formatDateInput = (value: string | null): string => {
  if (!value) {
    return '';
  }

  const valueMs = toTime(value);
  if (Number.isNaN(valueMs)) {
    return '';
  }

  return formatDate(new Date(valueMs), 'yyyy-mm-dd');
};

type GanttFilters = {
  startDate: string,
  endDate: string,
};

const Gantt = ({ name, ganttData, startedColumns, completedColumns, dateFormat, vscode }: {
  name: string,
  ganttData: GanttData,
  startedColumns: string[],
  completedColumns: string[],
  dateFormat: string,
  vscode: VSCodeApi,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const scrollXRef = useRef<HTMLDivElement | null>(null);
  const barElementMapRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(LABEL_WIDTH);
  const [measuredTaskRectById, setMeasuredTaskRectById] = useState<Map<string, Rect>>(new Map());
  const [draftScheduleByTaskId, setDraftScheduleByTaskId] = useState<Map<string, DraftSchedule>>(new Map());
  const [filters, setFilters] = useState<GanttFilters>({
    startDate: formatDateInput(ganttData.from),
    endDate: formatDateInput(ganttData.to),
  });
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoverIntent, setHoverIntent] = useState<DragIntent>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<DragIntent>(null);
  const activeInteractionRef = useRef<ActiveInteraction | null>(null);
  const chartTasksRef = useRef<Array<GanttTask & { safeStartMs: number, safeEndMs: number }>>([]);
  const draftScheduleByTaskIdRef = useRef<Map<string, DraftSchedule>>(new Map());
  const suppressClickTaskIdRef = useRef<string | null>(null);
  const refreshGanttData = useRef(debounce(500, (settings: GanttFilters) => {
    vscode.postMessage({
      command: 'kanbn.refreshGanttData',
      ...settings,
    });
  })).current;

  const defaultStartDate = formatDateInput(ganttData.from);
  const defaultEndDate = formatDateInput(ganttData.to);
  const hasActiveFilters = (
    (filters.startDate !== '' && filters.startDate !== defaultStartDate) ||
    (filters.endDate !== '' && filters.endDate !== defaultEndDate)
  );

  useEffect(() => {
    if (!scrollXRef.current) {
      return;
    }

    const updateLayout = () => {
      if (scrollXRef.current) {
        const style = getComputedStyle(scrollXRef.current);
        const cssLabelWidth = parseFloat(style.getPropertyValue('--kanbn-gantt-label-width'));
        const currentLabelWidth = Number.isFinite(cssLabelWidth) ? cssLabelWidth : LABEL_WIDTH;
        setLabelWidth(currentLabelWidth);
        setTimelineViewportWidth(Math.max(1, scrollXRef.current.clientWidth - currentLabelWidth));
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const fromMs = toTime(ganttData.from);
  const toMs = toTime(ganttData.to);
  const safeFromMs = Number.isNaN(fromMs) ? new Date().getTime() : fromMs;
  const safeToMs = Number.isNaN(toMs) ? safeFromMs : toMs;
  const span = Math.max(1, safeToMs - safeFromMs);

  const timelineWidth = useMemo(() => {
    const minTimelineWidth = Math.ceil((span / (1000 * 60 * 60 * 24)) * MIN_PIXELS_PER_DAY);
    return Math.max(320, timelineViewportWidth, minTimelineWidth);
  }, [timelineViewportWidth, span]);

  const canvasWidth = labelWidth + timelineWidth;

  useEffect(() => {
    setDraftScheduleByTaskId(new Map());
  }, [ganttData]);

  useEffect(() => {
    if (!filters.startDate && !filters.endDate) {
      setFilters({
        startDate: formatDateInput(ganttData.from),
        endDate: formatDateInput(ganttData.to),
      });
    }
  }, [filters.startDate, filters.endDate, ganttData.from, ganttData.to]);

  const chartTasks = useMemo(() => {
    const tasks = Array.isArray(ganttData.tasks) ? ganttData.tasks : [];
    const startedColumnSet = new Set(startedColumns || []);
    const completedColumnSet = new Set(completedColumns || []);

    return tasks.map((task) => {
      const startMs = toTime(task.start);
      const endMs = toTime(task.end);
      const dueMs = toTime(task.metadata && task.metadata.due ? task.metadata.due : (task.due || null));
      const draftSchedule = draftScheduleByTaskId.get(task.id);
      const baseStartMs = Number.isNaN(startMs) ? safeFromMs : startMs;
      const baseEndMs = Number.isNaN(endMs) ? baseStartMs : Math.max(baseStartMs, endMs);
      const safeStartMs = draftSchedule ? draftSchedule.startMs : baseStartMs;
      const safeEndMs = draftSchedule ? Math.max(draftSchedule.startMs, draftSchedule.endMs) : baseEndMs;
      const startRatio = clamp((safeStartMs - safeFromMs) / span, 0, 1);
      const endRatio = clamp((safeEndMs - safeFromMs) / span, 0, 1);
      const startPercent = startRatio * 100;
      const endPercent = endRatio * 100;
      const widthPercent = Math.max(0.8, endPercent - startPercent);
      const isPastDueInTimeline = !Number.isNaN(dueMs) && safeEndMs > dueMs;
      const inStartedColumn = startedColumnSet.has(task.column);
      const inCompletedColumn = completedColumnSet.has(task.column);
      const isCompleted = hasDate(task.completed) || inCompletedColumn;
      const isStarted = !isCompleted && (hasDate(task.started) || inStartedColumn);
      const statusClassName = isCompleted
        ? 'kanbn-gantt-bar-completed'
        : (isStarted ? 'kanbn-gantt-bar-started' : 'kanbn-gantt-bar-not-started');

      return {
        ...task,
        safeStartMs,
        safeEndMs,
        startPercent,
        endPercent,
        widthPercent,
        isPastDueInTimeline,
        statusClassName,
        columnClassName: toColumnClassName(task.column),
      };
    });
  }, [ganttData.tasks, safeFromMs, span, draftScheduleByTaskId, startedColumns, completedColumns]);

  const taskRects = useMemo<TaskRect[]>(() => {
    return chartTasks.map((task, index) => {
      const left = round(clamp((task.startPercent / 100) * timelineWidth, 0, timelineWidth));
      const right = round(clamp(((task.startPercent + task.widthPercent) / 100) * timelineWidth, 0, timelineWidth));
      const top = index * ROW_HEIGHT + GANTT_BAR_TOP;
      const bottom = top + GANTT_BAR_HEIGHT;

      return {
        id: task.id,
        index,
        rect: {
          left,
          right,
          top,
          bottom,
          centerX: round((left + right) / 2),
          centerY: round((top + bottom) / 2),
        },
      };
    });
  }, [chartTasks, timelineWidth]);

  const setBarElementRef = (taskId: string) => (element: HTMLButtonElement | null) => {
    if (element) {
      barElementMapRef.current.set(taskId, element);
      return;
    }

    barElementMapRef.current.delete(taskId);
  };

  useLayoutEffect(() => {
    if (!overlayRef.current || chartTasks.length === 0) {
      setMeasuredTaskRectById((previous) => (previous.size === 0 ? previous : new Map()));
      return;
    }

    const overlayBounds = overlayRef.current.getBoundingClientRect();
    const nextRectById = new Map<string, Rect>();

    chartTasks.forEach((task) => {
      const barElement = barElementMapRef.current.get(task.id);
      if (!barElement) {
        return;
      }

      const barBounds = barElement.getBoundingClientRect();
      const left = round(barBounds.left - overlayBounds.left);
      const right = round(barBounds.right - overlayBounds.left);
      const top = round(barBounds.top - overlayBounds.top);
      const bottom = round(barBounds.bottom - overlayBounds.top);

      nextRectById.set(task.id, {
        left,
        right,
        top,
        bottom,
        centerX: round((left + right) / 2),
        centerY: round((top + bottom) / 2),
      });
    });

    setMeasuredTaskRectById((previous) => (rectMapEqual(previous, nextRectById) ? previous : nextRectById));
  }, [chartTasks, timelineWidth, canvasWidth]);

  const taskIndexById = useMemo(() => {
    return new Map(chartTasks.map((task, index) => [task.id, index]));
  }, [chartTasks]);

  useEffect(() => {
    chartTasksRef.current = chartTasks;
  }, [chartTasks]);

  useEffect(() => {
    draftScheduleByTaskIdRef.current = draftScheduleByTaskId;
  }, [draftScheduleByTaskId]);

  const dependencyPaths = useMemo(() => {
    if (!timelineWidth || chartTasks.length === 0 || taskRects.length === 0) {
      return [];
    }

    const linePaths: DependencyPath[] = [];

    chartTasks.forEach((task, targetIndex) => {
      const sourceTaskRect = taskRects[targetIndex];
      const sourceRect = measuredTaskRectById.get(task.id) || (sourceTaskRect ? sourceTaskRect.rect : null);

      (task.dependencies || []).forEach((dependencyId) => {
        const sourceIndex = taskIndexById.get(dependencyId);
        if (sourceIndex === undefined) {
          if ((task.externalIncomingDependencies || []).includes(dependencyId)) {
            const targetTaskRect = taskRects[targetIndex];
            if (!targetTaskRect) {
              return;
            }

            const targetRect = measuredTaskRectById.get(task.id) || targetTaskRect.rect;
            const route = buildExternalIncomingDependencyPath(targetRect);
            if (route) {
              linePaths.push({
                key: `${dependencyId}-${task.id}-external-incoming`,
                path: route.path,
                isNonForward: false,
                isBlocks: false,
                isExternal: true,
                trailPath: route.trailPath,
                ellipsis: route.ellipsis,
              });
            }
          }
          return;
        }

        const key = `${dependencyId}-${task.id}`;

        const sourceTaskRect = taskRects[sourceIndex];
        const targetTaskRect = taskRects[targetIndex];
        if (!sourceTaskRect || !targetTaskRect) {
          return;
        }

        const sourceRect = measuredTaskRectById.get(dependencyId) || sourceTaskRect.rect;
        const targetRect = measuredTaskRectById.get(task.id) || targetTaskRect.rect;
        const route = buildSimpleDependencyPath(sourceRect, targetRect);
        if (route) {
          const sourceTask = chartTasks[sourceIndex];
          linePaths.push({
            key,
            path: route.path,
            isNonForward: route.isNonForward,
            isBlocks: !!sourceTask && hasBlocksRelation(sourceTask, task.id),
            isExternal: false,
          });
        }
      });

      (task.externalOutgoingDependents || []).forEach((dependentId) => {
        if (!sourceRect) {
          return;
        }

        const route = buildExternalOutgoingDependencyPath(sourceRect, timelineWidth);
        if (route) {
          linePaths.push({
            key: `${task.id}-${dependentId}-external-outgoing`,
            path: route.path,
            isNonForward: false,
            isBlocks: true,
            isExternal: true,
            trailPath: route.trailPath,
            ellipsis: route.ellipsis,
          });
        }
      });
    });

    return linePaths;
  }, [timelineWidth, chartTasks, taskIndexById, taskRects, measuredTaskRectById]);

  const nowMs = new Date().getTime();
  const nowRatio = (nowMs - safeFromMs) / span;
  const nowInRange = nowRatio >= 0 && nowRatio <= 1;
  const nowLeft = `${clamp(nowRatio * 100, 0, 100)}%`;

  const xAxisPlacements = useMemo(
    () => getXAxisPlacements(safeFromMs, safeToMs, timelineWidth, dateFormat),
    [safeFromMs, safeToMs, timelineWidth, dateFormat]
  );

  const openTask = (task: GanttTask) => {
    if (suppressClickTaskIdRef.current === task.id) {
      suppressClickTaskIdRef.current = null;
      return;
    }

    vscode.postMessage({
      command: 'kanbn.task',
      taskId: task.id,
      columnName: task.column,
    });
  };

  const getDragCapabilities = (task: GanttTask) => {
    const leftLocked = hasDate(task.started);
    const rightLocked = hasDate(task.completed);
    return {
      leftLocked,
      rightLocked,
      canDrag: !leftLocked && !rightLocked,
      canResizeLeft: !leftLocked,
      canResizeRight: !rightLocked,
    };
  };

  const getIntentFromPointer = (
    task: GanttTask,
    barBounds: DOMRect,
    clientX: number,
  ): DragIntent => {
    const capabilities = getDragCapabilities(task);
    const localX = clamp(clientX - barBounds.left, 0, barBounds.width);
    const edgeThreshold = Math.min(INTERACTION_EDGE_THRESHOLD, Math.max(4, Math.floor(barBounds.width / 3)));

    if (capabilities.canResizeLeft && localX <= edgeThreshold) {
      return 'resize-left';
    }

    if (capabilities.canResizeRight && localX >= barBounds.width - edgeThreshold) {
      return 'resize-right';
    }

    if (capabilities.canDrag) {
      return 'drag';
    }

    return null;
  };

  const persistTaskSchedule = useCallback((
    task: GanttTask,
    mode: DragMode,
    startMs: number,
    endMs: number,
  ) => {
    const nextPayload: {
      command: string,
      taskId: string,
      plannedStart?: string,
      plannedFinish?: string,
    } = {
      command: 'kanbn.gantt.updatePlannedDates',
      taskId: task.id,
    };

    const existingPlannedStartMs = parsePlannedTime(task, 'plannedStart');
    const existingPlannedFinishMs = parsePlannedTime(task, 'plannedFinish');

    if (mode === 'drag' || mode === 'resize-left') {
      if (Number.isNaN(existingPlannedStartMs) || Math.abs(existingPlannedStartMs - startMs) > 1000) {
        nextPayload.plannedStart = toIso(startMs);
      }
    }

    if (mode === 'drag' || mode === 'resize-right') {
      if (Number.isNaN(existingPlannedFinishMs) || Math.abs(existingPlannedFinishMs - endMs) > 1000) {
        nextPayload.plannedFinish = toIso(endMs);
      }
    }

    if (!nextPayload.plannedStart && !nextPayload.plannedFinish) {
      return;
    }

    vscode.postMessage(nextPayload);
  }, [vscode]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const interaction = activeInteractionRef.current;
      if (!interaction) {
        return;
      }

      const minDurationMs = Math.max(1, (MIN_BAR_PIXEL_WIDTH / Math.max(1, timelineWidth)) * span);
      const deltaPixels = event.clientX - interaction.startClientX;
      const deltaMs = (deltaPixels / Math.max(1, timelineWidth)) * span;
      const moved = Math.abs(deltaPixels) > DRAG_START_THRESHOLD;
      if (moved && !interaction.didMove) {
        interaction.didMove = true;
      }

      let nextStartMs = interaction.initialStartMs;
      let nextEndMs = interaction.initialEndMs;

      if (interaction.mode === 'drag') {
        const duration = Math.max(minDurationMs, interaction.initialEndMs - interaction.initialStartMs);
        nextStartMs = clamp(interaction.initialStartMs + deltaMs, safeFromMs, safeToMs - duration);
        nextEndMs = nextStartMs + duration;
      } else if (interaction.mode === 'resize-left') {
        nextStartMs = clamp(interaction.initialStartMs + deltaMs, safeFromMs, interaction.initialEndMs - minDurationMs);
      } else {
        nextEndMs = clamp(interaction.initialEndMs + deltaMs, interaction.initialStartMs + minDurationMs, safeToMs);
      }

      setDraftScheduleByTaskId((previous) => {
        const current = previous.get(interaction.taskId);
        if (current && current.startMs === nextStartMs && current.endMs === nextEndMs) {
          return previous;
        }

        const next = new Map(previous);
        next.set(interaction.taskId, {
          startMs: nextStartMs,
          endMs: nextEndMs,
        });
        return next;
      });
    };

    const onMouseUp = () => {
      const interaction = activeInteractionRef.current;
      if (!interaction) {
        return;
      }

      const task = chartTasksRef.current.find((t) => t.id === interaction.taskId);
      const draft = draftScheduleByTaskIdRef.current.get(interaction.taskId);
      if (task && draft && interaction.didMove) {
        suppressClickTaskIdRef.current = interaction.taskId;
        persistTaskSchedule(task, interaction.mode, draft.startMs, draft.endMs);
      }

      activeInteractionRef.current = null;
      setActiveTaskId(null);
      setActiveMode(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [persistTaskSchedule, safeFromMs, safeToMs, span, timelineWidth]);

  const handleBarMouseDown = (task: GanttTask, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const intent = getIntentFromPointer(task, event.currentTarget.getBoundingClientRect(), event.clientX);
    if (!intent) {
      return;
    }

    event.preventDefault();

    const activeChartTask = chartTasks.find((t) => t.id === task.id);
    if (!activeChartTask) {
      return;
    }

    activeInteractionRef.current = {
      taskId: task.id,
      mode: intent,
      startClientX: event.clientX,
      initialStartMs: activeChartTask.safeStartMs,
      initialEndMs: activeChartTask.safeEndMs,
      didMove: false,
    };
    setActiveTaskId(task.id);
    setActiveMode(intent);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = intent === 'drag' ? 'grabbing' : 'ew-resize';
  };

  const handleBarMouseMove = (task: GanttTask, event: React.MouseEvent<HTMLButtonElement>) => {
    if (activeInteractionRef.current) {
      return;
    }

    const intent = getIntentFromPointer(task, event.currentTarget.getBoundingClientRect(), event.clientX);
    setHoveredTaskId(task.id);
    setHoverIntent(intent);
  };

  const handleBarMouseLeave = () => {
    if (activeInteractionRef.current) {
      return;
    }
    setHoveredTaskId(null);
    setHoverIntent(null);
  };

  const getBarCursor = (task: GanttTask): string | undefined => {
    if (activeTaskId === task.id) {
      if (activeMode === 'drag') {
        return 'grabbing';
      }
      if (activeMode === 'resize-left' || activeMode === 'resize-right') {
        return 'ew-resize';
      }
      return undefined;
    }

    if (hoveredTaskId !== task.id || !hoverIntent) {
      return undefined;
    }

    if (hoverIntent === 'drag') {
      return 'grab';
    }

    return 'ew-resize';
  };

  const updateFilters = (nextFilters: GanttFilters) => {
    setFilters(nextFilters);
    refreshGanttData(nextFilters);
  };

  const handleChangeStartDate = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters({
      ...filters,
      startDate: event.target.value,
    });
  };

  const handleChangeEndDate = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters({
      ...filters,
      endDate: event.target.value,
    });
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      startDate: '',
      endDate: '',
    };
    updateFilters(clearedFilters);
  };

  return (
    <div className="kanbn-gantt-page">
      <div className="kanbn-header">
        <h1 className="kanbn-header-name">
          <p>{name}</p>
          <div className="kanbn-burndown-settings">
            <form>
              <input
                type="date"
                value={filters.startDate}
                className="kanbn-burndown-settings-input kanbn-burndown-settings-start-date"
                onChange={handleChangeStartDate}
              />
              <input
                type="date"
                value={filters.endDate}
                className="kanbn-burndown-settings-input kanbn-burndown-settings-end-date"
                onChange={handleChangeEndDate}
              />
              {
                hasActiveFilters &&
                <button
                  type="button"
                  className="kanbn-header-button kanbn-header-button-clear-filter"
                  onClick={handleClearFilters}
                  title="Clear chart filters"
                >
                  <i className="codicon codicon-clear-all"></i>
                </button>
              }
            </form>
          </div>
        </h1>
      </div>

      {
        ganttData.dependencyCycleDetected &&
        <div className="kanbn-gantt-warning" role="alert">
          <strong>Dependency cycle detected.</strong>
          {
            Array.isArray(ganttData.dependencyCycleTaskIds) && ganttData.dependencyCycleTaskIds.length > 0 &&
            <p>
              Cycle: {ganttData.dependencyCycleTaskIds.join(' -> ')}
            </p>
          }
          {
            Array.isArray(ganttData.cycleFallbackTaskIds) && ganttData.cycleFallbackTaskIds.length > 0 &&
            <p>
              Fallback scheduling applied to: {ganttData.cycleFallbackTaskIds.join(', ')}
            </p>
          }
        </div>
      }

      <div className="kanbn-gantt">
        <div className="kanbn-gantt-scroll-x" ref={scrollXRef}>
          <div className="kanbn-gantt-canvas" style={{ width: `${canvasWidth}px` }}>
            <div className="kanbn-gantt-scroll-y">
              <div className="kanbn-gantt-body" style={{ minHeight: `${chartTasks.length * ROW_HEIGHT}px` }}>
            <div className="kanbn-gantt-overlay" ref={overlayRef}>
              {
                timelineWidth > 0 && chartTasks.length > 0 &&
                <svg
                  className="kanbn-gantt-dependencies"
                  width={timelineWidth}
                  height={chartTasks.length * ROW_HEIGHT}
                  viewBox={`0 0 ${timelineWidth} ${chartTasks.length * ROW_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="kanbn-gantt-arrow-default"
                      markerWidth="7"
                      markerHeight="7"
                      refX="7"
                      refY="3.5"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M 0 0 L 7 3.5 L 0 7 z" className="kanbn-gantt-arrow-head" />
                    </marker>
                    <marker
                      id="kanbn-gantt-arrow-blocks"
                      markerWidth="7"
                      markerHeight="7"
                      refX="7"
                      refY="3.5"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M 0 0 L 7 3.5 L 0 7 z" className="kanbn-gantt-arrow-head-blocks" />
                    </marker>
                  </defs>
                  {
                    dependencyPaths.map((dependencyPath) => (
                      <path
                        key={dependencyPath.key}
                        d={dependencyPath.path}
                        className={[
                          'kanbn-gantt-dependency-line',
                          dependencyPath.isNonForward ? 'kanbn-gantt-dependency-line-non-forward' : null,
                          dependencyPath.isBlocks ? 'kanbn-gantt-dependency-line-blocks' : null,
                          dependencyPath.isExternal ? 'kanbn-gantt-dependency-line-external' : null,
                        ].filter((i) => !!i).join(' ')}
                        markerEnd={dependencyPath.isBlocks ? 'url(#kanbn-gantt-arrow-blocks)' : 'url(#kanbn-gantt-arrow-default)'}
                      />
                    ))
                  }
                  {
                    dependencyPaths.map((dependencyPath) => (
                      dependencyPath.trailPath
                        ? <path
                            key={`${dependencyPath.key}-trail`}
                            d={dependencyPath.trailPath}
                            className={[
                              'kanbn-gantt-dependency-line',
                              'kanbn-gantt-dependency-line-external',
                              'kanbn-gantt-dependency-line-external-tail',
                              dependencyPath.isBlocks ? 'kanbn-gantt-dependency-line-blocks' : null,
                            ].filter((i) => !!i).join(' ')}
                          />
                        : null
                    ))
                  }
                  {
                    dependencyPaths.map((dependencyPath) => (
                      dependencyPath.ellipsis
                        ? <text
                            key={`${dependencyPath.key}-ellipsis`}
                            x={dependencyPath.ellipsis.x}
                            y={dependencyPath.ellipsis.y}
                            className="kanbn-gantt-dependency-ellipsis"
                          >
                            ...
                          </text>
                        : null
                    ))
                  }
                </svg>
              }
              {
                nowInRange &&
                <div
                  className="kanbn-gantt-now-line"
                  style={{ left: nowLeft }}
                  title={`Now: ${formatDate(nowMs, dateFormat)}`}
                ></div>
              }
            </div>
              {
                chartTasks.map((task) => (
                  <div key={task.id} className={[
                    'kanbn-gantt-row',
                    task.columnClassName,
                    `kanbn-gantt-row-${task.columnClassName}`,
                  ].join(' ')}>
                    <button
                      type="button"
                      className="kanbn-gantt-task-name"
                      onClick={() => openTask(task)}
                      title={task.id}
                    >
                      {task.name}
                      {task.blocked ? <i className="kanbn-gantt-blocked-icon codicon codicon-warning-compact"></i> : ''}
                    </button>
                    <div className="kanbn-gantt-row-timeline">
                      <button
                        type="button"
                        ref={setBarElementRef(task.id)}
                        className={[
                          'kanbn-gantt-bar',
                          task.statusClassName,
                          `kanbn-gantt-bar-${task.columnClassName}`,
                          task.isPastDueInTimeline ? 'kanbn-gantt-bar-overdue' : null,
                        ].filter((i) => !!i).join(' ')}
                        onMouseDown={(event) => handleBarMouseDown(task, event)}
                        onMouseMove={(event) => handleBarMouseMove(task, event)}
                        onMouseLeave={handleBarMouseLeave}
                        onClick={() => openTask(task)}
                        style={{
                          left: `${task.startPercent}%`,
                          width: `${task.widthPercent}%`,
                          cursor: getBarCursor(task),
                        }}
                        title={`${task.id}\n${formatDate(task.safeStartMs, dateFormat)} -> ${formatDate(task.safeEndMs, dateFormat)}`}
                      >
                        <span>{task.id}</span>
                      </button>
                    </div>
                  </div>
                ))
              }
              </div>
            </div>

            <div className="kanbn-gantt-axis">
              <div className="kanbn-gantt-axis-label-spacer"></div>
              <div className="kanbn-gantt-axis-timeline">
                {
                  nowInRange &&
                  <div
                    className="kanbn-gantt-now-line kanbn-gantt-now-line-axis"
                    style={{ left: nowLeft }}
                    aria-hidden="true"
                  ></div>
                }
                {
                  xAxisPlacements.map((placement, index) => (
                <div
                  key={`${placement.label}-${index}`}
                  className={[
                    'kanbn-gantt-axis-label',
                    index === 0 ? 'kanbn-gantt-axis-label-first' : null,
                    index === xAxisPlacements.length - 1 ? 'kanbn-gantt-axis-label-last' : null,
                  ].filter((i) => !!i).join(' ')}
                  style={{ left: `${timelineWidth > 0 ? (placement.x / timelineWidth) * 100 : 0}%` }}
                >
                  <span className="kanbn-gantt-axis-tick"></span>
                  <span className="kanbn-gantt-axis-label-text">{placement.label}</span>
                </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gantt;
