/// Runs a server action from a client transition and never rejects. The action
/// itself turns API errors into a result, but the call rejects when the network
/// drops or the request is cut off — and an error thrown inside a transition
/// reaches the error boundary and replaces the whole page.
export async function settle<T>(action: () => Promise<T>, onFailure: () => T): Promise<T> {
  try {
    return await action()
  } catch {
    return onFailure()
  }
}
