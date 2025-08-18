#!/bin/bash

# cURL 签名生成示例
# cURL signature generation example

# 配置变量
APP_ID="your-app-id"
KEY_ID="key-001"
PRIVATE_KEY_FILE="private_key.pem"
BASE_URL="https://api.example.com"
ALGORITHM="RS256"

# 生成时间戳
generate_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
}

# 构建签名数据字符串
build_signature_string() {
    local timestamp="$1"
    local method="$2"
    local path="$3"
    local app_id="$4"
    local body="$5"
    
    printf "%s\n%s\n%s\n%s\n%s" "$timestamp" "$method" "$path" "$app_id" "$body"
}

# 生成签名
generate_signature() {
    local data="$1"
    local private_key_file="$2"
    local algorithm="$3"
    
    case "$algorithm" in
        "RS256")
            echo -n "$data" | openssl dgst -sha256 -sign "$private_key_file" | base64 -w 0
            ;;
        "RS512")
            echo -n "$data" | openssl dgst -sha512 -sign "$private_key_file" | base64 -w 0
            ;;
        "ES256")
            echo -n "$data" | openssl dgst -sha256 -sign "$private_key_file" | base64 -w 0
            ;;
        "ES512")
            echo -n "$data" | openssl dgst -sha512 -sign "$private_key_file" | base64 -w 0
            ;;
        *)
            echo "Unsupported algorithm: $algorithm" >&2
            exit 1
            ;;
    esac
}

# 发送签名请求
send_signed_request() {
    local method="$1"
    local path="$2"
    local body="$3"
    local extra_headers="$4"
    
    # 生成时间戳
    local timestamp=$(generate_timestamp)
    
    # 构建签名数据
    local signature_data=$(build_signature_string "$timestamp" "$method" "$path" "$APP_ID" "$body")
    
    # 生成签名
    local signature=$(generate_signature "$signature_data" "$PRIVATE_KEY_FILE" "$ALGORITHM")
    
    # 构建请求头
    local headers=(
        -H "X-Signature: $signature"
        -H "X-Timestamp: $timestamp"
        -H "X-App-Id: $APP_ID"
    )
    
    # 添加 Key ID（如果有）
    if [ -n "$KEY_ID" ]; then
        headers+=(-H "X-Key-Id: $KEY_ID")
    fi
    
    # 添加额外的请求头
    if [ -n "$extra_headers" ]; then
        IFS=',' read -ra ADDR <<< "$extra_headers"
        for header in "${ADDR[@]}"; do
            headers+=(-H "$header")
        done
    fi
    
    # 构建完整 URL
    local url="${BASE_URL}${path}"
    
    # 发送请求
    if [ -n "$body" ]; then
        headers+=(-H "Content-Type: application/json")
        curl -X "$method" "$url" "${headers[@]}" -d "$body"
    else
        curl -X "$method" "$url" "${headers[@]}"
    fi
}

# 便捷函数
signed_get() {
    send_signed_request "GET" "$1" "" "$2"
}

signed_post() {
    send_signed_request "POST" "$1" "$2" "$3"
}

signed_put() {
    send_signed_request "PUT" "$1" "$2" "$3"
}

signed_delete() {
    send_signed_request "DELETE" "$1" "" "$2"
}

signed_patch() {
    send_signed_request "PATCH" "$1" "$2" "$3"
}

# 生成测试密钥对
generate_test_keys() {
    echo "Generating RSA key pair..."
    
    # 生成私钥
    openssl genpkey -algorithm RSA -out private_key.pem -pkcs8 -pass pass: 2048
    
    # 生成公钥
    openssl rsa -pubout -in private_key.pem -out public_key.pem
    
    echo "Keys generated:"
    echo "  Private key: private_key.pem"
    echo "  Public key: public_key.pem"
}

# 验证签名（用于测试）
verify_signature() {
    local data="$1"
    local signature="$2"
    local public_key_file="$3"
    local algorithm="$4"
    
    # 将 base64 签名解码到临时文件
    local sig_file=$(mktemp)
    echo "$signature" | base64 -d > "$sig_file"
    
    case "$algorithm" in
        "RS256")
            echo -n "$data" | openssl dgst -sha256 -verify "$public_key_file" -signature "$sig_file"
            ;;
        "RS512")
            echo -n "$data" | openssl dgst -sha512 -verify "$public_key_file" -signature "$sig_file"
            ;;
        "ES256")
            echo -n "$data" | openssl dgst -sha256 -verify "$public_key_file" -signature "$sig_file"
            ;;
        "ES512")
            echo -n "$data" | openssl dgst -sha512 -verify "$public_key_file" -signature "$sig_file"
            ;;
        *)
            echo "Unsupported algorithm: $algorithm" >&2
            rm "$sig_file"
            exit 1
            ;;
    esac
    
    local result=$?
    rm "$sig_file"
    return $result
}

# 使用示例
example_usage() {
    echo "=== API Signature Authentication cURL Examples ==="
    echo
    
    # 检查私钥文件是否存在
    if [ ! -f "$PRIVATE_KEY_FILE" ]; then
        echo "Private key file not found. Generating test keys..."
        generate_test_keys
        echo
    fi
    
    echo "Configuration:"
    echo "  App ID: $APP_ID"
    echo "  Key ID: $KEY_ID"
    echo "  Algorithm: $ALGORITHM"
    echo "  Base URL: $BASE_URL"
    echo "  Private Key: $PRIVATE_KEY_FILE"
    echo
    
    echo "=== Example 1: GET Request ==="
    echo "Command: signed_get '/api/users'"
    echo "Response:"
    signed_get "/api/users"
    echo
    echo
    
    echo "=== Example 2: POST Request ==="
    local post_data='{"name":"John Doe","email":"john@example.com"}'
    echo "Command: signed_post '/api/users' '$post_data'"
    echo "Response:"
    signed_post "/api/users" "$post_data"
    echo
    echo
    
    echo "=== Example 3: PUT Request ==="
    local put_data='{"name":"Jane Doe","email":"jane@example.com"}'
    echo "Command: signed_put '/api/users/123' '$put_data'"
    echo "Response:"
    signed_put "/api/users/123" "$put_data"
    echo
    echo
    
    echo "=== Example 4: DELETE Request ==="
    echo "Command: signed_delete '/api/users/123'"
    echo "Response:"
    signed_delete "/api/users/123"
    echo
    echo
    
    echo "=== Example 5: Manual Signature Generation ==="
    local timestamp=$(generate_timestamp)
    local method="GET"
    local path="/api/profile"
    local signature_data=$(build_signature_string "$timestamp" "$method" "$path" "$APP_ID" "")
    local signature=$(generate_signature "$signature_data" "$PRIVATE_KEY_FILE" "$ALGORITHM")
    
    echo "Timestamp: $timestamp"
    echo "Method: $method"
    echo "Path: $path"
    echo "App ID: $APP_ID"
    echo "Signature Data:"
    echo "$signature_data"
    echo
    echo "Generated Signature: $signature"
    echo
    echo "Manual cURL command:"
    echo "curl -X GET '${BASE_URL}${path}' \\"
    echo "  -H 'X-Signature: $signature' \\"
    echo "  -H 'X-Timestamp: $timestamp' \\"
    echo "  -H 'X-App-Id: $APP_ID'"
    if [ -n "$KEY_ID" ]; then
        echo "  -H 'X-Key-Id: $KEY_ID'"
    fi
    echo
}

# 帮助信息
show_help() {
    echo "API Signature Authentication cURL Helper"
    echo
    echo "Usage: $0 [command] [options]"
    echo
    echo "Commands:"
    echo "  example                 Run example requests"
    echo "  generate-keys          Generate test RSA key pair"
    echo "  get <path>             Send signed GET request"
    echo "  post <path> <body>     Send signed POST request"
    echo "  put <path> <body>      Send signed PUT request"
    echo "  delete <path>          Send signed DELETE request"
    echo "  patch <path> <body>    Send signed PATCH request"
    echo "  help                   Show this help message"
    echo
    echo "Environment Variables:"
    echo "  APP_ID                 Application ID (default: your-app-id)"
    echo "  KEY_ID                 Key ID (optional)"
    echo "  PRIVATE_KEY_FILE       Private key file path (default: private_key.pem)"
    echo "  BASE_URL               API base URL (default: https://api.example.com)"
    echo "  ALGORITHM              Signature algorithm (default: RS256)"
    echo
    echo "Examples:"
    echo "  $0 example"
    echo "  $0 generate-keys"
    echo "  $0 get /api/users"
    echo "  $0 post /api/users '{\"name\":\"John\"}'"
    echo
}

# 主函数
main() {
    case "${1:-example}" in
        "example")
            example_usage
            ;;
        "generate-keys")
            generate_test_keys
            ;;
        "get")
            if [ -z "$2" ]; then
                echo "Error: Path is required for GET request" >&2
                exit 1
            fi
            signed_get "$2"
            ;;
        "post")
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo "Error: Path and body are required for POST request" >&2
                exit 1
            fi
            signed_post "$2" "$3"
            ;;
        "put")
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo "Error: Path and body are required for PUT request" >&2
                exit 1
            fi
            signed_put "$2" "$3"
            ;;
        "delete")
            if [ -z "$2" ]; then
                echo "Error: Path is required for DELETE request" >&2
                exit 1
            fi
            signed_delete "$2"
            ;;
        "patch")
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo "Error: Path and body are required for PATCH request" >&2
                exit 1
            fi
            signed_patch "$2" "$3"
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo "Unknown command: $1" >&2
            echo "Use '$0 help' for usage information" >&2
            exit 1
            ;;
    esac
}

# 如果脚本被直接执行，运行主函数
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi