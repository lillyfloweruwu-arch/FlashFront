// SPDX-License-Identifier: AGPL-3.0-only
// Copyright OpenFront and Contributors. FlashFront: offline replacement of client/Auth.ts; no identity or network.
export type UserAuth = false;
export type TokenLoginResult = { status: "failed"; code: "invalid" };
export const PUBLIC_ID_CACHE_PREFIX = "cached_public_id_";
export const getDesktopSessionState = () => ({ status: "signed-out" as const });
export const discordLogin = () => {};
export const googleLogin = () => {};
export const steamLogin = () => {};
export const linkGoogle = async () => false;
export const linkSteam = async () => false;
export const tempTokenLogin = async (_token: string): Promise<TokenLoginResult> => ({ status: "failed", code: "invalid" });
export const getAuthHeader = async () => "";
export const logOut = async (_allSessions = false) => false;
export const clearLocalSession = () => {};
export const isLoggedIn = async () => false;
export const isSessionActive = (_sub: string) => false;
export const userAuth = async (_shouldRefresh = true): Promise<UserAuth> => false;
export const reauthAfterPortalChange = userAuth;
export const retrySteamSignIn = userAuth;
export const sendMagicLink = async (_email: string) => false;
export const getPlayToken = async () => "";
export const getPersistentID = () => "";
export const rememberPublicId = (_persistentId: string, _publicId: string) => {};
export const getCachedPublicId = (_persistentId: string): null => null;
