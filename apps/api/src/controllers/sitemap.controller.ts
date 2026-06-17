import { Request, Response } from 'express';
import * as sitemapService from '../services/sitemap.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(_req: Request, res: Response): Promise<void> {
  try {
    const entries = await sitemapService.listEntries();
    sendSuccess(res, entries);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const entry = await sitemapService.getEntry(parseIntParam(req.params.id));
    sendSuccess(res, entry);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { url, priority, changefreq, lastmod } = req.body;
    const entry = await sitemapService.createEntry({ url, priority, changefreq, lastmod });
    sendSuccess(res, entry, 201, 'Entry created');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { url, priority, changefreq, lastmod } = req.body;
    const entry = await sitemapService.updateEntry(parseIntParam(req.params.id), { url, priority, changefreq, lastmod });
    sendSuccess(res, entry, 200, 'Entry updated');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    await sitemapService.deleteEntry(parseIntParam(req.params.id));
    sendSuccess(res, { message: 'Entry deleted' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function xml(req: Request, res: Response): Promise<void> {
  try {
    const baseUrl = (req.query.baseUrl as string) || process.env.SITE_URL || 'https://example.com';
    const content = await sitemapService.generateXml(baseUrl);
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(content);
  } catch (error) {
    handleError(res, error);
  }
}
