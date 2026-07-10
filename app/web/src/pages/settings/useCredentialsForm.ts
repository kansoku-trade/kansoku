import { useReducer } from "react";
import { friendlyCredentialError, type DesktopCredentialsBridge } from "./desktopCredentials";
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

  const handleTest = async () => {
    if (!allCredentialsFieldsFilled(state.fields)) return;
    dispatch({ type: "test-start" });
    const result = await bridge.test(state.fields);
    if (result.ok) dispatch({ type: "test-ok" });
    else dispatch({ type: "test-fail", message: friendlyCredentialError(result.error) ?? result.error });
  };

  const handleSave = async () => {
    if (!allCredentialsFieldsFilled(state.fields)) return;
    dispatch({ type: "save-start" });
    const result = await bridge.set(state.fields);
    if (result.ok) {
      dispatch({ type: "save-ok" });
      onSaved();
    } else {
      dispatch({ type: "save-fail", message: friendlyCredentialError(result.error) ?? result.error });
    }
  };

  return { state, canSubmit, setField, handleTest, handleSave };
}
