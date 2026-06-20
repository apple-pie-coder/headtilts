import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import * as svc from '../services/apiAnalytics.service';
import { Granularity } from '../services/apiAnalytics.service';

export async function getOverview(_req: Request, res: Response) {
  const data = await svc.getOverviewStats();
  sendSuccess(res, data);
}

export async function getCallsOverTime(req: Request, res: Response) {
  const granularity = (req.query.granularity as Granularity) ?? 'day';
  if (!['day', 'week', 'month'].includes(granularity)) {
    sendError(res, 'BAD_REQUEST', 'granularity must be day, week, or month', 400);
    return;
  }
  const data = await svc.getCallsOverTime(granularity);
  sendSuccess(res, data);
}

export async function getCallsPerKey(_req: Request, res: Response) {
  const data = await svc.getCallsPerKey();
  sendSuccess(res, data);
}

export async function getTopEndpoints(_req: Request, res: Response) {
  const data = await svc.getTopEndpoints();
  sendSuccess(res, data);
}

export async function getErrorRateByEndpoint(_req: Request, res: Response) {
  const data = await svc.getErrorRateByEndpoint();
  sendSuccess(res, data);
}

export async function getPeakHours(_req: Request, res: Response) {
  const data = await svc.getPeakHours();
  sendSuccess(res, data);
}

export async function exportCsv(req: Request, res: Response) {
  const to = new Date();
  const fromParam = req.query.from as string | undefined;
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 24 * 3600_000);
  if (isNaN(from.getTime())) {
    sendError(res, 'BAD_REQUEST', 'Invalid from date', 400);
    return;
  }
  const csv = await svc.exportCsv(from, to);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="api-usage-${to.toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}
