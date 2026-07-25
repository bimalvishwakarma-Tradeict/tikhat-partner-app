/**
 * Report download API service — PDF/Excel statements.
 */

import { apiDownload } from './api';
import type { ReportDownloadParams, ReportFileResult } from '../types/api.types';

const INVESTOR = '/api/v1/investor/reports';
const ADMIN = '/api/v1/admin/reports';

export const reportService = {
  async getMyStatement(params: ReportDownloadParams): Promise<ReportFileResult> {
    return apiDownload(`${INVESTOR}/statement`, { params });
  },

  async getInvestorStatement(
    investorId: string,
    params: ReportDownloadParams
  ): Promise<ReportFileResult> {
    return apiDownload(`${ADMIN}/investor/${investorId}/statement`, { params });
  },

  async getCapitalReport(params: ReportDownloadParams): Promise<ReportFileResult> {
    return apiDownload(`${ADMIN}/capital`, { params });
  },

  async getRevenueReport(params: ReportDownloadParams): Promise<ReportFileResult> {
    return apiDownload(`${ADMIN}/revenue`, { params });
  },

  async getFinancialYearReport(params: {
    year: number;
    format?: 'pdf' | 'excel' | 'xlsx';
  }): Promise<ReportFileResult> {
    return apiDownload(`${ADMIN}/financial-year`, { params });
  },
};
