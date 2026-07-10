import { useReducer } from "react";
import type { DesktopCredentialsBridge } from "./desktopCredentials";
import { runCredentialsSave, runCredentialsTest } from "./credentialsFormActions";
import {
  allCredentialsFieldsFilled,
  credentialsFormReducer,
  initialCredentialsFormState,
  type CredentialsFormFields,
} from "./credentialsFormState";

export function useCredentialsForm(bridge: DesktopCredentialsBridge, onSaved: () => void) {
  const [state, dispatch] = useReducer(credentialsFormReducer, initialCredentialsFormState);
  const canSubmit = allCredentialsFieldsFilled(state.fields) && state.testStatus !== "testing" && state.saveStatus !== "saving";

  const setField = (key: keyof CredentialsFormFields, value: string) => dispatch({ type: "field", key, value });

  const handleTest = () => {
    if (!allCredentialsFieldsFilled(state.fields)) return;
    void runCredentialsTest(bridge, state.fields, dispatch);
  };

  const handleSave = () => {
    if (!allCredentialsFieldsFilled(state.fields)) return;
    void runCredentialsSave(bridge, state.fields, dispatch, onSaved);
  };

  return { state, canSubmit, setField, handleTest, handleSave };
}
