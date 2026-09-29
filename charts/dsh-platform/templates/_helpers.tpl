{{- define "dsh.name" -}}dsh-platform{{- end -}}
{{- define "dsh.config" -}}
{{- $oidc := dict "issuer" .Values.oidc.issuer "clientId" .Values.oidc.clientId "platformOrigin" (printf "https://%s" .Values.domain) "siteDomain" .Values.domain "clientSecretFile" "/private/oidc-client-secret" -}}
{{- $runtime := dict "kubernetes" (dict "server" "https://kubernetes.default.svc" "caFile" "/var/run/dsh-kubernetes/ca.crt" "tokenFile" "/var/run/dsh-kubernetes/token") "namespacePrefix" .Values.namespacePrefix "domain" (printf "env.%s" .Values.domain) "image" .Values.workloadImage "storage" (dict "size" .Values.storageSize "storageClassName" .Values.storageClassName) "resources" .Values.resources "platformNamespace" .Release.Namespace -}}
{{- dict "runtime" $runtime "stateFile" "/state/platform/state.sqlite" "adminSocket" "/state/platform/admin.sock" "oidc" $oidc "members" .Values.members "host" "0.0.0.0" "port" 8080 | toJson -}}
{{- end -}}
