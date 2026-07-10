import { errorMessage } from "../../api";
import { friendlyCredentialError, type DesktopCredentialsBridge } from "./desktopCredentials";
import type { CredentialsFormAction, CredentialsFormFields } from "./credentialsFormState";

type Dispatch = (action: CredentialsFormAction) => void;

export async function runCredentialsTest(
  bridge: Pick<DesktopCredentialsBridge, "test">,
  fields: CredentialsFormFields,
  dispatch: Dispatch,
): Promise<void> {
  dispatch({ type: "test-start" });
  try {
    const result = await bridge.test(fields);
    if (result.ok) dispatch({ type: "test-ok" });
    else dispatch({ type: "test-fail", message: friendlyCredentialError(result.error) ?? result.error });
  } catch (err) {
    const message = errorMessage(err);
    dispatch({ type: "test-fail", message: friendlyCredentialError(message) ?? message });
  }
}

export async function runCredentialsSave(
  bridge: Pick<DesktopCredentialsBridge, "set">,
  fields: CredentialsFormFields,
  dispatch: Dispatch,
  onSaved: () => void,
): Promise<void> {
  dispatch({ type: "save-start" });
  try {
    const result = await bridge.set(fields);
    if (result.ok) {
      dispatch({ type: "save-ok" });
      onSaved();
    } else {
      dispatch({ type: "save-fail", message: friendlyCredentialError(result.error) ?? result.error });
    }
  } catch (err) {
    const message = errorMessage(err);
    dispatch({ type: "save-fail", message: friendlyCredentialError(message) ?? message });
  }
}
