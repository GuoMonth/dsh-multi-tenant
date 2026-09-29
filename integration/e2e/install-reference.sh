#!/usr/bin/env bash
set -euo pipefail
: "${E_PRIVATE:?}" "${E_NAMESPACE:?}" "${E_NODE_ADDRESS:?}" "${E_PLATFORM_IMAGE:?}"
# Isolated installer DNS and CA trust; product containers retain UID 1000.
docker run --rm --user "$(id -u):$(id -g)" --network kind \
  --add-host "idp.dsh-mvp-rc2.test:$E_NODE_ADDRESS" \
  --add-host "dsh-mvp-rc2.test:$E_NODE_ADDRESS" \
  --add-host "preflight.env.dsh-mvp-rc2.test:$E_NODE_ADDRESS" \
  -v "$PWD:/work:ro" -v "$E_PRIVATE:/private:ro" \
  -v /usr/local/bin/kubectl:/usr/local/bin/kubectl:ro \
  -v /usr/local/bin/helm:/usr/local/bin/helm:ro \
  -e NODE_EXTRA_CA_CERTS=/private/ca.crt --entrypoint node "$E_PLATFORM_IMAGE" \
  /app/node_modules/dsh-multi-tenant/dist/cli.mjs "${1:-preflight}" --values /private/values.json \
  --namespace "$E_NAMESPACE" --kubeconfig /private/container-kubeconfig --context "kind-${E_CLUSTER:-dsh-mvp-rc2}"
