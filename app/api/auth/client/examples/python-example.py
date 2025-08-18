"""
Python 签名生成示例
Python signature generation example

依赖安装:
pip install cryptography requests
"""

import base64
import json
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Union
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
from cryptography.exceptions import InvalidSignature


class PythonSignatureClient:
    """Python 签名客户端"""
    
    SUPPORTED_ALGORITHMS = ['RS256', 'RS512', 'ES256', 'ES512']
    
    def __init__(self, config: Dict[str, Any]):
        self.app_id = config['appId']
        self.private_key = config['privateKey']
        self.algorithm = config.get('algorithm', 'RS256')
        self.key_id = config.get('keyId')
        self.base_url = config.get('baseUrl', '')
        
        if self.algorithm not in self.SUPPORTED_ALGORITHMS:
            raise ValueError(f"Unsupported algorithm: {self.algorithm}")
        
        # 加载私钥
        self._load_private_key()
    
    def _load_private_key(self):
        """加载私钥"""
        try:
            self.private_key_obj = serialization.load_pem_private_key(
                self.private_key.encode('utf-8'),
                password=None
            )
        except Exception as e:
            raise ValueError(f"Failed to load private key: {e}")
    
    def build_signature_string(self, data: Dict[str, Any]) -> str:
        """构建签名数据字符串"""
        parts = [
            data['timestamp'],
            data['method'].upper(),
            data['path'],
            data['appId'],
            data.get('body', '')
        ]
        return '\n'.join(parts)
    
    def generate_signature(self, data: str) -> str:
        """生成签名"""
        data_bytes = data.encode('utf-8')
        
        try:
            if self.algorithm in ['RS256', 'RS512']:
                # RSA 签名
                hash_algorithm = hashes.SHA256() if self.algorithm == 'RS256' else hashes.SHA512()
                signature = self.private_key_obj.sign(
                    data_bytes,
                    padding.PKCS1v15(),
                    hash_algorithm
                )
            elif self.algorithm in ['ES256', 'ES512']:
                # ECDSA 签名
                hash_algorithm = hashes.SHA256() if self.algorithm == 'ES256' else hashes.SHA512()
                signature = self.private_key_obj.sign(
                    data_bytes,
                    ec.ECDSA(hash_algorithm)
                )
            else:
                raise ValueError(f"Unsupported algorithm: {self.algorithm}")
            
            return base64.b64encode(signature).decode('utf-8')
            
        except Exception as e:
            raise RuntimeError(f"Failed to generate signature: {e}")
    
    def generate_timestamp(self) -> str:
        """生成当前时间戳"""
        return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    
    def generate_signature_headers(
        self, 
        method: str, 
        path: str, 
        body: Optional[str] = None,
        custom_timestamp: Optional[str] = None
    ) -> Dict[str, str]:
        """生成签名请求头"""
        timestamp = custom_timestamp or self.generate_timestamp()
        
        signature_data = {
            'timestamp': timestamp,
            'method': method.upper(),
            'path': path,
            'body': body,
            'appId': self.app_id
        }
        
        data_string = self.build_signature_string(signature_data)
        signature = self.generate_signature(data_string)
        
        headers = {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-App-Id': self.app_id
        }
        
        if self.key_id:
            headers['X-Key-Id'] = self.key_id
        
        return headers
    
    def send_signed_request(
        self,
        method: str,
        path: str,
        body: Optional[Union[str, Dict, list]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> requests.Response:
        """发送签名请求"""
        body_string = None
        if body is not None:
            body_string = body if isinstance(body, str) else json.dumps(body)
        
        url = self.base_url + path
        signature_headers = self.generate_signature_headers(method, path, body_string)
        
        # 合并请求头
        all_headers = {**signature_headers}
        if headers:
            all_headers.update(headers)
        
        # 如果有 JSON 数据，设置 Content-Type
        if body_string and not isinstance(body, str):
            all_headers['Content-Type'] = 'application/json'
        
        return requests.request(
            method=method.upper(),
            url=url,
            headers=all_headers,
            data=body_string,
            **kwargs
        )
    
    # 便捷方法
    def get(self, path: str, headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """GET 请求"""
        return self.send_signed_request('GET', path, headers=headers, **kwargs)
    
    def post(self, path: str, body: Optional[Union[str, Dict, list]] = None, 
             headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """POST 请求"""
        return self.send_signed_request('POST', path, body, headers, **kwargs)
    
    def put(self, path: str, body: Optional[Union[str, Dict, list]] = None,
            headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """PUT 请求"""
        return self.send_signed_request('PUT', path, body, headers, **kwargs)
    
    def delete(self, path: str, headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """DELETE 请求"""
        return self.send_signed_request('DELETE', path, headers=headers, **kwargs)
    
    def patch(self, path: str, body: Optional[Union[str, Dict, list]] = None,
              headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """PATCH 请求"""
        return self.send_signed_request('PATCH', path, body, headers, **kwargs)


def generate_rsa_key_pair(key_size: int = 2048) -> Dict[str, str]:
    """生成 RSA 密钥对"""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size
    )
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')
    
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')
    
    return {
        'privateKey': private_pem,
        'publicKey': public_pem
    }


def generate_ec_key_pair(curve_name: str = 'secp256r1') -> Dict[str, str]:
    """生成 ECDSA 密钥对"""
    if curve_name == 'secp256r1':
        curve = ec.SECP256R1()
    elif curve_name == 'secp521r1':
        curve = ec.SECP521R1()
    else:
        raise ValueError(f"Unsupported curve: {curve_name}")
    
    private_key = ec.generate_private_key(curve)
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')
    
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')
    
    return {
        'privateKey': private_pem,
        'publicKey': public_pem
    }


# 使用示例
def example():
    """使用示例"""
    
    # 生成测试密钥对
    key_pair = generate_rsa_key_pair()
    print("Generated RSA key pair")
    
    # 配置客户端
    client = PythonSignatureClient({
        'appId': 'your-app-id',
        'privateKey': key_pair['privateKey'],
        'algorithm': 'RS256',
        'keyId': 'key-001',
        'baseUrl': 'https://api.example.com'
    })
    
    try:
        # GET 请求示例
        print("Sending GET request...")
        response = client.get('/api/users')
        print(f"GET Response: {response.status_code}")
        
        # POST 请求示例
        print("Sending POST request...")
        post_data = {
            'name': 'John Doe',
            'email': 'john@example.com'
        }
        response = client.post('/api/users', post_data)
        print(f"POST Response: {response.status_code}")
        
        # 手动生成签名头示例
        headers = client.generate_signature_headers('GET', '/api/profile')
        print(f"Generated headers: {headers}")
        
    except Exception as e:
        print(f"Request failed: {e}")


if __name__ == '__main__':
    example()