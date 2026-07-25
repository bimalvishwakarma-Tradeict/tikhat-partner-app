/**
 * Investor profile API service (self-service).
 */

import { apiGet, apiPatch, apiPost, apiRequest, apiUpload } from './api';
import type {
  MyProfileData,
  ProfileDocumentsUploadData,
  ProfilePhotoUploadData,
  ProfileUpdatePayload,
  ProfileUpdateSubmitData,
  UpdateRequestsData,
} from '../types/api.types';
import type { FileUploadAsset } from '../types/models.types';

const PROFILE = '/api/v1/investor/profile';

function appendFile(form: FormData, field: string, file: FileUploadAsset): void {
  form.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

export const profileService = {
  async getProfile(): Promise<MyProfileData> {
    return apiGet<MyProfileData>(`${PROFILE}/`);
  },

  async updateProfile(
    payload: ProfileUpdatePayload
  ): Promise<{ data: ProfileUpdateSubmitData; message: string }> {
    const envelope = await apiRequest<ProfileUpdateSubmitData>(
      'patch',
      `${PROFILE}/`,
      payload
    );
    return { data: envelope.data, message: envelope.message };
  },

  async uploadPhoto(photo: FileUploadAsset): Promise<ProfilePhotoUploadData> {
    const form = new FormData();
    appendFile(form, 'photo', photo);
    return apiUpload<ProfilePhotoUploadData>(`${PROFILE}/photo`, form);
  },

  async uploadDocuments(files: {
    pan_front?: FileUploadAsset;
    pan_back?: FileUploadAsset;
    aadhar_front?: FileUploadAsset;
    aadhar_back?: FileUploadAsset;
  }): Promise<ProfileDocumentsUploadData> {
    const form = new FormData();
    (Object.keys(files) as Array<keyof typeof files>).forEach((key) => {
      const file = files[key];
      if (file) {
        appendFile(form, key, file);
      }
    });
    return apiUpload<ProfileDocumentsUploadData>(`${PROFILE}/documents`, form);
  },

  async requestEmailChange(newEmail: string): Promise<unknown> {
    return apiPost(`${PROFILE}/request-email-change`, {
      new_email: newEmail,
    });
  },

  async requestMobileChange(newMobile: string): Promise<unknown> {
    return apiPost(`${PROFILE}/request-mobile-change`, {
      new_mobile: newMobile,
    });
  },

  async dismissBanner(): Promise<{ banner_dismissed: boolean }> {
    return apiPatch(`${PROFILE}/dismiss-banner`);
  },

  async deactivate(confirm = true): Promise<{ status: string }> {
    return apiPost(`${PROFILE}/deactivate`, { confirm });
  },

  async getUpdateRequests(): Promise<UpdateRequestsData> {
    return apiGet<UpdateRequestsData>(`${PROFILE}/update-requests`);
  },
};
