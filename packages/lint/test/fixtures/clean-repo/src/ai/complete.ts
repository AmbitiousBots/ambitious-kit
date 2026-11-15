export const complete = async (prompt: string, key: string): Promise<unknown> => {
  const response = await fetch("https://example.invalid/v1/complete", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: JSON.stringify({ prompt }),
  });
  return response.json();
};
