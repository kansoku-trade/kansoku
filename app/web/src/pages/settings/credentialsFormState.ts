export interface CredentialsFormFields {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export type CredentialsTestStatus = "idle" | "testing" | "ok" | "fail";
export type CredentialsSaveStatus = "idle" | "saving" | "fail";

export interface CredentialsFormState {
  fields: CredentialsFormFields;
  testStatus: CredentialsTestStatus;
  testMessage: string | null;
  saveStatus: CredentialsSaveStatus;
  saveError: string | null;
}

export type CredentialsFormAction =
  | { type: "field"; key: keyof CredentialsFormFields; value: string }
  | { type: "test-start" }
  | { type: "test-ok" }
  | { type: "test-fail"; message: string }
  | { type: "save-start" }
  | { type: "save-fail"; message: string }
  | { type: "save-ok" };

export const emptyCredentialsFields: CredentialsFormFields = { appKey: "", appSecret: "", accessToken: "" };

export const initialCredentialsFormState: CredentialsFormState = {
  fields: emptyCredentialsFields,
  testStatus: "idle",
  testMessage: null,
  saveStatus: "idle",
  saveError: null,
};

export function allCredentialsFieldsFilled(fields: CredentialsFormFields): boolean {
  return fields.appKey.trim() !== "" && fields.appSecret.trim() !== "" && fields.accessToken.trim() !== "";
}

export function credentialsFormReducer(
  state: CredentialsFormState,
  action: CredentialsFormAction,
): CredentialsFormState {
  switch (action.type) {
    case "field":
      return {
        ...state,
        fields: { ...state.fields, [action.key]: action.value },
        testStatus: "idle",
        testMessage: null,
        saveStatus: "idle",
        saveError: null,
      };
    case "test-start":
      return { ...state, testStatus: "testing", testMessage: null };
    case "test-ok":
      return { ...state, testStatus: "ok", testMessage: null };
    case "test-fail":
      return { ...state, testStatus: "fail", testMessage: action.message };
    case "save-start":
      return { ...state, saveStatus: "saving", saveError: null };
    case "save-fail":
      return { ...state, saveStatus: "fail", saveError: action.message };
    case "save-ok":
      return { ...initialCredentialsFormState };
    default:
      return state;
  }
}
