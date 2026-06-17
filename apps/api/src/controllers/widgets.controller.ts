import { Request, Response } from 'express';
import * as widgetsService from '../services/widgets.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function listTypes(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, widgetsService.WIDGET_TYPES);
}

export async function list(_req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await widgetsService.listWidgets());
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await widgetsService.getWidgetById(parseIntParam(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const widget = await widgetsService.createWidget(req.body);
    sendSuccess(res, widget, 201, 'Widget created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await widgetsService.updateWidget(parseIntParam(req.params.id), req.body));
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    await widgetsService.deleteWidget(parseIntParam(req.params.id));
    sendSuccess(res, { message: 'Widget deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function listZones(_req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await widgetsService.listZones());
  } catch (error) {
    handleError(res, error);
  }
}

export async function setZoneWidgets(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;
    const { widgetIds } = req.body;
    if (!Array.isArray(widgetIds)) {
      sendError(res, 'VALIDATION_ERROR', 'widgetIds must be an array', 400);
      return;
    }
    sendSuccess(res, await widgetsService.setZoneWidgets(name, widgetIds));
  } catch (error) {
    handleError(res, error);
  }
}
