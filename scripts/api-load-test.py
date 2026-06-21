#!/usr/bin/env python3
"""
api-load-test.py — Interactive API endpoint load tester with auto-loaded endpoints
Sends requests to endpoints at random intervals with API key/JWT support.
"""

import requests
import random
import time
import json
import sys
import signal
import os
from datetime import datetime
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path

# Colors for terminal output
class Colors:
    CYAN = '\033[0;36m'
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    BOLD = '\033[1m'
    NC = '\033[0m'

class HTTPMethod(Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"

@dataclass
class RequestConfig:
    url: str
    method: HTTPMethod
    headers: Dict[str, str]
    payload: Optional[Dict] = None
    auth_required: bool = True

@dataclass
class RequestStats:
    total: int = 0
    success: int = 0
    failed: int = 0
    avg_time: float = 0.0

class APILoadTester:
    def __init__(self):
        self.endpoints: List[RequestConfig] = []
        self.stats: Dict[str, RequestStats] = {}
        self.running = False
        self.min_interval = 1.0
        self.max_interval = 10.0
        self.base_url = "http://localhost:3000/api"
        self.api_key = ""
        self.jwt_token = ""
        self.auth_type = "none"  # 'none', 'api-key', 'jwt'
        self.config_file = Path(__file__).parent / "endpoints-config.json"

        signal.signal(signal.SIGINT, self._handle_interrupt)

    def _handle_interrupt(self, signum, frame):
        """Handle Ctrl+C"""
        print(f"\n\n{Colors.YELLOW}⚠  Stopping...{Colors.NC}")
        self.running = False
        self.print_summary()
        sys.exit(0)

    def print_banner(self):
        """Print ASCII banner"""
        print(f"{Colors.CYAN}")
        print("╔════════════════════════════════════════════╗")
        print("║     🔄 API Load Tester 🔄                 ║")
        print("║                                            ║")
        print("║  Send requests to endpoints at random      ║")
        print("║  intervals with API key support            ║")
        print("╚════════════════════════════════════════════╝")
        print(f"{Colors.NC}")

    def clear_screen(self):
        """Clear terminal screen"""
        print("\033[2J\033[H", end='')

    def load_endpoints_from_config(self) -> bool:
        """Load endpoints from JSON config file"""
        if not self.config_file.exists():
            print(f"{Colors.YELLOW}⚠${Colors.NC} Config file not found: {self.config_file}")
            return False

        try:
            with open(self.config_file) as f:
                data = json.load(f)

            self.base_url = data.get("baseUrl", self.base_url)

            for endpoint_data in data.get("endpoints", []):
                try:
                    method = HTTPMethod[endpoint_data["method"].upper()]
                    config = RequestConfig(
                        url=self.base_url + endpoint_data["path"],
                        method=method,
                        headers=endpoint_data.get("headers", {}),
                        payload=endpoint_data.get("payload"),
                        auth_required=endpoint_data.get("authRequired", True),
                    )
                    self.endpoints.append(config)
                    self.stats[endpoint_data["path"]] = RequestStats()
                except Exception as e:
                    print(f"{Colors.RED}✗ Error parsing endpoint: {e}{Colors.NC}")

            print(f"{Colors.GREEN}✓ Loaded {len(self.endpoints)} endpoints from config{Colors.NC}")
            return len(self.endpoints) > 0

        except json.JSONDecodeError:
            print(f"{Colors.RED}✗ Invalid JSON in config file{Colors.NC}")
            return False
        except Exception as e:
            print(f"{Colors.RED}✗ Error loading config: {e}{Colors.NC}")
            return False

    def configure_auth(self):
        """Configure API key or JWT token"""
        print(f"\n{Colors.BOLD}Authentication Setup{Colors.NC}")
        print(f"  {Colors.BLUE}1${Colors.NC}  No authentication")
        print(f"  {Colors.BLUE}2${Colors.NC}  API Key (header)")
        print(f"  {Colors.BLUE}3${Colors.NC}  JWT Token (Bearer)")
        print(f"  {Colors.BLUE}4${Colors.NC}  Skip (use later)")

        choice = input(f"\nSelect auth type [1-4]: ").strip()

        if choice == '1':
            self.auth_type = "none"
            print(f"{Colors.GREEN}✓ No authentication configured{Colors.NC}")
        elif choice == '2':
            api_key = input("Enter API Key: ").strip()
            if api_key:
                self.api_key = api_key
                self.auth_type = "api-key"
                print(f"{Colors.GREEN}✓ API Key configured{Colors.NC}")
        elif choice == '3':
            token = input("Enter JWT Token: ").strip()
            if token:
                self.jwt_token = token
                self.auth_type = "jwt"
                print(f"{Colors.GREEN}✓ JWT Token configured{Colors.NC}")
        else:
            print(f"{Colors.YELLOW}! Skipped for now{Colors.NC}")

    def configure_base_url(self):
        """Configure base API URL"""
        print(f"\n{Colors.BOLD}API Configuration{Colors.NC}")
        current = self.base_url
        print(f"Current base URL: {Colors.BLUE}{current}{Colors.NC}")

        new_url = input("Enter new base URL (or press Enter to keep current): ").strip()
        if new_url:
            self.base_url = new_url
            # Update all endpoint URLs
            for endpoint in self.endpoints:
                endpoint.url = endpoint.url.replace(current, new_url)
            print(f"{Colors.GREEN}✓ Base URL updated{Colors.NC}")

    def configure_timing(self):
        """Configure request timing"""
        print(f"\n{Colors.BOLD}Configure Timing{Colors.NC}")

        while True:
            try:
                self.min_interval = float(input("Min interval (seconds) [default: 1]: ") or "1")
                self.max_interval = float(input("Max interval (seconds) [default: 10]: ") or "10")

                if self.min_interval > self.max_interval:
                    print(f"{Colors.RED}✗ Min must be less than max{Colors.NC}")
                    continue

                print(f"{Colors.GREEN}✓ Timing set: {self.min_interval}s - {self.max_interval}s{Colors.NC}")
                break
            except ValueError:
                print(f"{Colors.RED}✗ Enter valid numbers{Colors.NC}")

    def filter_endpoints(self) -> bool:
        """Filter endpoints by keywords"""
        print(f"\n{Colors.BOLD}Filter Endpoints (optional){Colors.NC}")
        keywords = input("Enter keywords to filter (e.g., 'posts,users') or press Enter to use all: ").strip().lower()

        if not keywords:
            return True

        keyword_list = [k.strip() for k in keywords.split(",")]
        filtered = [e for e in self.endpoints if any(k in e.url.lower() for k in keyword_list)]

        if filtered:
            print(f"{Colors.GREEN}✓ Filtered to {len(filtered)}/{len(self.endpoints)} endpoints{Colors.NC}")
            self.endpoints = filtered
            return True
        else:
            print(f"{Colors.RED}✗ No endpoints match keywords{Colors.NC}")
            return False

    def review_config(self) -> bool:
        """Review and confirm configuration"""
        self.clear_screen()
        self.print_banner()

        print(f"\n{Colors.BOLD}Configuration Review:{Colors.NC}\n")

        print(f"  Base URL:    {Colors.BLUE}{self.base_url}{Colors.NC}")
        print(f"  Auth:        {Colors.BLUE}{self.auth_type.upper()}{Colors.NC}")
        print(f"  Interval:    {Colors.BLUE}{self.min_interval}s - {self.max_interval}s{Colors.NC}")
        print(f"  Endpoints:   {Colors.BLUE}{len(self.endpoints)}{Colors.NC}\n")

        for i, endpoint in enumerate(self.endpoints[:10], 1):
            auth_indicator = "🔒" if endpoint.auth_required else "🔓"
            print(f"  {Colors.BLUE}{i:2}. {auth_indicator}{Colors.NC} {endpoint.method.value:6} {endpoint.url}")

        if len(self.endpoints) > 10:
            print(f"  ... and {len(self.endpoints) - 10} more")

        response = input(f"\n{Colors.BOLD}Start testing? [y/N]: {Colors.NC}").strip().lower()
        return response == 'y'

    def get_headers_for_request(self, endpoint: RequestConfig) -> Dict[str, str]:
        """Get request headers with auth"""
        headers = endpoint.headers.copy()
        headers["User-Agent"] = "APILoadTester/1.0"

        if endpoint.auth_required:
            if self.auth_type == "api-key" and self.api_key:
                headers["X-API-Key"] = self.api_key
            elif self.auth_type == "jwt" and self.jwt_token:
                headers["Authorization"] = f"Bearer {self.jwt_token}"

        return headers

    def send_request(self, config: RequestConfig) -> tuple[int, float]:
        """Send a single request and return status code and time"""
        try:
            start = time.time()
            headers = self.get_headers_for_request(config)

            if config.method == HTTPMethod.GET:
                resp = requests.get(config.url, headers=headers, timeout=10)
            elif config.method == HTTPMethod.POST:
                resp = requests.post(config.url, json=config.payload, headers=headers, timeout=10)
            elif config.method == HTTPMethod.PUT:
                resp = requests.put(config.url, json=config.payload, headers=headers, timeout=10)
            elif config.method == HTTPMethod.PATCH:
                resp = requests.patch(config.url, json=config.payload, headers=headers, timeout=10)
            elif config.method == HTTPMethod.DELETE:
                resp = requests.delete(config.url, headers=headers, timeout=10)

            elapsed = time.time() - start
            return resp.status_code, elapsed

        except requests.exceptions.Timeout:
            return 0, 0.0
        except requests.exceptions.ConnectionError:
            return 0, 0.0
        except Exception:
            return 0, 0.0

    def log_request(self, config: RequestConfig, status: int, elapsed: float):
        """Log request result"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        path = config.url.replace(self.base_url, "")

        if 200 <= status < 300:
            status_color = Colors.GREEN
            symbol = "✓"
            self.stats[path].success += 1
        elif status == 0:
            status_color = Colors.RED
            symbol = "✗"
            self.stats[path].failed += 1
        else:
            status_color = Colors.YELLOW
            symbol = "!"
            self.stats[path].failed += 1

        self.stats[path].total += 1

        # Update average time
        stats = self.stats[path]
        if stats.total == 1:
            stats.avg_time = elapsed
        else:
            stats.avg_time = (stats.avg_time * (stats.total - 1) + elapsed) / stats.total

        print(f"[{timestamp}] {status_color}{symbol}{Colors.NC} {config.method.value:6} "
              f"{status:3} {elapsed:.2f}s | {path[:50]}")

    def print_summary(self):
        """Print statistics summary"""
        if not self.stats:
            return

        print(f"\n\n{Colors.BOLD}{'='*60}{Colors.NC}")
        print(f"{Colors.BOLD}Test Summary{Colors.NC}")
        print(f"{Colors.BOLD}{'='*60}{Colors.NC}\n")

        total_requests = sum(s.total for s in self.stats.values())
        total_success = sum(s.success for s in self.stats.values())
        total_failed = sum(s.failed for s in self.stats.values())

        print(f"Total Requests:  {Colors.BLUE}{total_requests}{Colors.NC}")
        print(f"Success:         {Colors.GREEN}{total_success}{Colors.NC}")
        print(f"Failed:          {Colors.RED}{total_failed}{Colors.NC}")

        if total_requests > 0:
            success_rate = (total_success / total_requests) * 100
            print(f"Success Rate:    {Colors.BOLD}{success_rate:.1f}%{Colors.NC}\n")

        print(f"{Colors.BOLD}Per-Endpoint Stats:{Colors.NC}\n")
        for path, stats in sorted(self.stats.items()):
            if stats.total > 0:
                rate = (stats.success / stats.total) * 100
                print(f"  {path[:40]:40} | {stats.total:4} | "
                      f"{Colors.GREEN}{rate:5.1f}%{Colors.NC} | "
                      f"Avg: {stats.avg_time:.3f}s")

        print(f"\n{Colors.BOLD}{'='*60}{Colors.NC}\n")

    def run(self):
        """Main interactive flow"""
        self.print_banner()

        # Load endpoints from config
        print(f"\n{Colors.BOLD}Loading endpoints...{Colors.NC}\n")
        if not self.load_endpoints_from_config():
            print(f"{Colors.RED}✗ Failed to load endpoints. Create {self.config_file}${Colors.NC}")
            sys.exit(1)

        # Setup phase
        while True:
            print(f"\n{Colors.BOLD}Setup{Colors.NC}")
            print(f"  {Colors.BLUE}1${Colors.NC}  Configure authentication")
            print(f"  {Colors.BLUE}2${Colors.NC}  Configure base URL")
            print(f"  {Colors.BLUE}3${Colors.NC}  Configure timing")
            print(f"  {Colors.BLUE}4${Colors.NC}  Filter endpoints")
            print(f"  {Colors.BLUE}5${Colors.NC}  Review & start")
            print(f"  {Colors.BLUE}6${Colors.NC}  Exit")

            choice = input(f"\nEnter choice [1-6]: ").strip()

            if choice == '1':
                self.configure_auth()
            elif choice == '2':
                self.configure_base_url()
            elif choice == '3':
                self.configure_timing()
            elif choice == '4':
                self.filter_endpoints()
            elif choice == '5':
                if self.review_config():
                    self.start_testing()
                break
            elif choice == '6':
                print(f"{Colors.BLUE}Goodbye!{Colors.NC}")
                sys.exit(0)
            else:
                print(f"{Colors.RED}✗ Invalid choice{Colors.NC}")

    def start_testing(self):
        """Start continuous request loop"""
        self.running = True
        self.clear_screen()
        self.print_banner()

        print(f"\n{Colors.GREEN}✓ Testing started. Press Ctrl+C to stop.{Colors.NC}\n")
        print(f"{Colors.BOLD}Requests:{Colors.NC}\n")

        try:
            while self.running:
                config = random.choice(self.endpoints)
                status, elapsed = self.send_request(config)
                self.log_request(config, status, elapsed)

                wait_time = random.uniform(self.min_interval, self.max_interval)
                time.sleep(wait_time)

        except KeyboardInterrupt:
            pass

def main():
    tester = APILoadTester()
    tester.run()

if __name__ == "__main__":
    main()
