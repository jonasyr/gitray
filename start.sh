#!/bin/bash

# GitRay Development Environment Manager
# Professional monorepo management script with service orchestration

set -euo pipefail

# Global state for graceful shutdown
SCRIPT_RUNNING=true
SHUTDOWN_IN_PROGRESS=false
CURRENT_OPERATION=""

# ============================================================================
# CONFIGURATION & CONSTANTS
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/.gitray.log"
CONFIG_FILE="$SCRIPT_DIR/.gitray.config"
PID_FILE="$SCRIPT_DIR/.gitray.pid"

# Service definitions
declare -A SERVICES=(
    ["redis"]="Redis Cache Server"
    ["backend"]="Backend API Server" 
    ["frontend"]="Frontend Development Server"
    ["shared-types"]="Shared Types Watcher"
)

declare -A SERVICE_PORTS=(
    ["redis"]="6379"
    ["backend"]="3001"
    ["frontend"]="5173"
)

declare -A SERVICE_COMMANDS=(
    ["redis"]="docker run --name gitray-redis -d -p 6379:6379 redis:7-alpine"
    ["backend"]="pnpm --filter backend run dev"
    ["frontend"]="pnpm --filter frontend run dev"
    ["shared-types"]="pnpm --filter @gitray/shared-types run watch"
)

# Colors and styling
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly GRAY='\033[0;37m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

# Icons
readonly ICON_SUCCESS="✅"
readonly ICON_ERROR="❌"
readonly ICON_WARNING="⚠️"
readonly ICON_INFO="ℹ️"
readonly ICON_ROCKET="🚀"
readonly ICON_GEAR="⚙️"
readonly ICON_CLEAN="🧹"
readonly ICON_TEST="🧪"
readonly ICON_DOCKER="🐳"
readonly ICON_SERVER="🖥️"
readonly ICON_DATABASE="🗄️"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

# Global graceful shutdown handler
graceful_shutdown() {
    if [ "$SHUTDOWN_IN_PROGRESS" = "true" ]; then
        # If already shutting down, force exit on second Ctrl+C
        echo -e "\n${RED}${ICON_ERROR} Force exit requested${NC}"
        exit 1
    fi
    
    SHUTDOWN_IN_PROGRESS=true
    SCRIPT_RUNNING=false
    
    echo -e "\n${YELLOW}${ICON_WARNING} Graceful shutdown initiated...${NC}"
    
    if [ -n "$CURRENT_OPERATION" ]; then
        echo -e "${DIM}Interrupting: $CURRENT_OPERATION${NC}"
    fi
    
    echo -e "${BLUE}${ICON_GEAR} Stopping all services...${NC}"
    stop_all_services_quiet
    
    echo -e "${BLUE}${ICON_CLEAN} Cleaning up processes...${NC}"
    cleanup_background_processes
    
    echo -e "${GREEN}${ICON_SUCCESS} Shutdown complete${NC}"
    echo -e "${GREEN}Thank you for using GitRay! ${ICON_SUCCESS}${NC}"
    exit 0
}

# Set up global trap for graceful shutdown
trap 'graceful_shutdown' INT TERM

cleanup_background_processes() {
    # Kill any remaining background processes we might have started
    local pids_to_kill=()
    
    # Collect PIDs from our PID files
    for service in "${!SERVICES[@]}"; do
        local pid_file="$SCRIPT_DIR/.$service.pid"
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file" 2>/dev/null || echo "")
            if [ -n "$pid" ]; then
                pids_to_kill+=("$pid")
            fi
        fi
    done
    
    # Kill collected PIDs
    for pid in "${pids_to_kill[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Clean up any remaining pnpm dev and watch processes
    pkill -f "pnpm.*dev" 2>/dev/null || true
    pkill -f "pnpm.*watch" 2>/dev/null || true
    
    # Clean up TypeScript compiler processes
    pkill -f "tsc.*watch" 2>/dev/null || true
    
    # Clean up PID files
    rm -f "$SCRIPT_DIR"/.*.pid 2>/dev/null || true
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

print_header() {
    clear
    echo -e "${MAGENTA}${BOLD}"
    cat << 'EOF'
   ██████╗ ██╗████████╗██████╗  █████╗ ██╗   ██╗
  ██╔════╝ ██║╚══██╔══╝██╔══██╗██╔══██╗╚██╗ ██╔╝
  ██║  ███╗██║   ██║   ██████╔╝███████║ ╚████╔╝ 
  ██║   ██║██║   ██║   ██╔══██╗██╔══██║  ╚██╔╝  
  ╚██████╔╝██║   ██║   ██║  ██║██║  ██║   ██║   
   ╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
EOF
    echo -e "${NC}${WHITE}Git Visualization Development Environment${NC}"
    echo -e "${DIM}Professional monorepo orchestration${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..50})${NC}"
    echo
}

print_status_line() {
    local service="$1"
    local status="$2"
    local port="$3"
    local icon color
    
    case "$status" in
        "running") icon="${ICON_SUCCESS}" color="${GREEN}" ;;
        "stopped") icon="${ICON_ERROR}" color="${RED}" ;;
        "starting") icon="${YELLOW}⚡${NC}" color="${YELLOW}" ;;
        *) icon="${ICON_WARNING}" color="${YELLOW}" ;;
    esac
    
    printf "  %-15s %s ${color}%-8s${NC}" "$service" "$icon" "$status"
    [ -n "$port" ] && printf " ${DIM}:$port${NC}"
    echo
}

spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while ps -p $pid > /dev/null 2>&1; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

check_dependencies() {
    local missing=()
    
    command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v node >/dev/null 2>&1 || missing+=("node")
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}${ICON_ERROR} Missing dependencies: ${missing[*]}${NC}"
        echo -e "${YELLOW}Please install missing dependencies and retry${NC}"
        exit 1
    fi
}

check_port() {
    local port="$1"
    lsof -i ":$port" >/dev/null 2>&1
}

get_service_status() {
    local service="$1"
    local port="${SERVICE_PORTS[$service]:-}"
    
    case "$service" in
        "redis")
            if docker ps --format "table {{.Names}}" | grep -q "gitray-redis"; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
        "frontend")
            # Check for any Vite process running, and get actual port if different
            if pgrep -f "vite" >/dev/null 2>&1; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
        "shared-types")
            # Check for TypeScript compiler in watch mode
            if pgrep -f "tsc.*watch" >/dev/null 2>&1; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
        *)
            if [ -n "$port" ] && check_port "$port"; then
                echo "running"
            else
                echo "stopped"
            fi
            ;;
    esac
}

show_system_status() {
    local overwrite="${1:-false}"
    
    # If overwriting, move cursor up to clear previous status
    if [ "$overwrite" = "true" ]; then
        # Calculate actual lines to clear:
        # 1 (header) + 1 (blank) + 4 (services) + 1 (blank) + 1 (log file) + 1 (separator) + 1 (blank) = 10 lines
        printf "\033[10A"
        # Clear from cursor to end of screen
        printf "\033[J"
    fi
    
    echo -e "${BOLD}${BLUE}${ICON_SERVER} System Status${NC}"
    echo
    
    for service in "${!SERVICES[@]}"; do
        local status=$(get_service_status "$service")
        local port="${SERVICE_PORTS[$service]:-}"
        print_status_line "${SERVICES[$service]}" "$status" "$port"
    done
    
    echo
    echo -e "${DIM}Log file: $LOG_FILE${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..50})${NC}"
    echo
}

# ============================================================================
# SERVICE MANAGEMENT
# ============================================================================

start_service() {
    local service="$1"
    local cmd="${SERVICE_COMMANDS[$service]}"
    local show_logs="${2:-true}"
    
    # Check if we should continue running
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    echo -e "${BLUE}${ICON_GEAR} Starting ${SERVICES[$service]}...${NC}"
    CURRENT_OPERATION="Starting ${SERVICES[$service]}"
    
    case "$service" in
        "redis")
            # Stop existing container if running
            docker stop gitray-redis 2>/dev/null || true
            docker rm gitray-redis 2>/dev/null || true
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                return 1
            fi
            
            if eval "$cmd" >/dev/null 2>&1; then
                echo -e "${GREEN}${ICON_DATABASE} Redis started successfully${NC}"
                log "Redis container started"
            else
                echo -e "${RED}${ICON_ERROR} Failed to start Redis${NC}"
                echo -e "${DIM}Check: docker ps${NC}"
                return 1
            fi
            ;;
        "shared-types")
            echo -e "${YELLOW}Building shared types...${NC}"
            CURRENT_OPERATION="Building shared types"
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                return 1
            fi
            
            # First build the shared types
            if ! pnpm --filter @gitray/shared-types build; then
                echo -e "${RED}${ICON_ERROR} Failed to build shared types${NC}"
                return 1
            fi
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                return 1
            fi
            
            # Then start the watcher like other services
            local log_file="$SCRIPT_DIR/.$service.log"
            echo -e "${BLUE}Starting shared types watcher in background...${NC}"
            
            # Start service and capture PID with NO_COLOR environment variable
            env NO_COLOR=1 $cmd > "$log_file" 2>&1 &
            local pid=$!
            echo $pid > "$SCRIPT_DIR/.$service.pid"
            
            # Wait a moment for service to initialize
            local wait_count=0
            while [ $wait_count -lt 30 ] && [ "$SCRIPT_RUNNING" = "true" ]; do
                sleep 0.1
                wait_count=$((wait_count + 1))
            done
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                kill "$pid" 2>/dev/null || true
                return 1
            fi
            
            # Check if process is still running
            if ! kill -0 $pid 2>/dev/null; then
                echo -e "${RED}${ICON_ERROR} Failed to start shared types watcher${NC}"
                echo -e "${YELLOW}Last few lines from log:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -10 "$log_file" 2>/dev/null || echo "No log output available"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                return 1
            fi
            
            # Show initial startup logs
            if [[ "$show_logs" == "true" ]]; then
                echo -e "${GREEN}${ICON_SUCCESS} Shared types watcher started (PID: $pid)${NC}"
                echo -e "${DIM}Initial output:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -5 "$log_file" 2>/dev/null || echo "Waiting for output..."
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
            fi
            ;;
        *)
            local log_file="$SCRIPT_DIR/.$service.log"
            echo -e "${BLUE}Starting $service in background...${NC}"
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                return 1
            fi
            
            # Start service and capture PID
            $cmd > "$log_file" 2>&1 &
            local pid=$!
            echo $pid > "$SCRIPT_DIR/.$service.pid"
            
            # Wait a moment for service to initialize
            local wait_count=0
            while [ $wait_count -lt 30 ] && [ "$SCRIPT_RUNNING" = "true" ]; do
                sleep 0.1
                wait_count=$((wait_count + 1))
            done
            
            if [ "$SCRIPT_RUNNING" = "false" ]; then
                kill "$pid" 2>/dev/null || true
                return 1
            fi
            
            # Check if process is still running
            if ! kill -0 $pid 2>/dev/null; then
                echo -e "${RED}${ICON_ERROR} Failed to start $service${NC}"
                echo -e "${YELLOW}Last few lines from log:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -10 "$log_file" 2>/dev/null || echo "No log output available"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                return 1
            fi
            
            # Show initial startup logs
            if [[ "$show_logs" == "true" ]]; then
                echo -e "${GREEN}${ICON_SUCCESS} $service started (PID: $pid)${NC}"
                echo -e "${DIM}Initial output:${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                tail -5 "$log_file" 2>/dev/null || echo "Waiting for output..."
                echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
            fi
            ;;
    esac
    
    CURRENT_OPERATION=""
}

stop_service() {
    local service="$1"
    local service_name="${SERVICES[$service]:-$service}"
    
    case "$service" in
        "redis")
            docker stop gitray-redis 2>/dev/null || true
            docker rm gitray-redis 2>/dev/null || true
            echo -e "${YELLOW}Redis stopped${NC}"
            ;;
        "frontend")
            # Kill all vite processes
            pkill -f "vite" 2>/dev/null || true
            # Kill all pnpm processes running frontend dev
            pkill -f "pnpm.*frontend.*dev" 2>/dev/null || true
            # Also try to kill by PID file if it exists
            local pid_file="$SCRIPT_DIR/.$service.pid"
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                if [ -n "$pid" ]; then
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 1
                    kill -KILL "$pid" 2>/dev/null || true
                fi
                rm -f "$pid_file"
            fi
            echo -e "${YELLOW}$service_name stopped${NC}"
            ;;
        "backend")
            # Kill processes using the backend port
            local port="${SERVICE_PORTS[$service]:-}"
            if [ -n "$port" ]; then
                local pids=$(lsof -t -i ":$port" 2>/dev/null || echo "")
                if [ -n "$pids" ]; then
                    for pid in $pids; do
                        kill -TERM "$pid" 2>/dev/null || true
                    done
                    sleep 1
                    for pid in $pids; do
                        kill -KILL "$pid" 2>/dev/null || true
                    done
                fi
            fi
            # Kill all pnpm processes running backend dev
            pkill -f "pnpm.*backend.*dev" 2>/dev/null || true
            # Also try to kill by PID file if it exists
            local pid_file="$SCRIPT_DIR/.$service.pid"
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                if [ -n "$pid" ]; then
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 1
                    kill -KILL "$pid" 2>/dev/null || true
                fi
                rm -f "$pid_file"
            fi
            echo -e "${YELLOW}$service_name stopped${NC}"
            ;;
        "shared-types")
            # Kill TypeScript compiler watch processes
            pkill -f "tsc.*watch" 2>/dev/null || true
            # Kill all pnpm processes running shared-types watch
            pkill -f "pnpm.*shared-types.*watch" 2>/dev/null || true
            # Also try to kill by PID file if it exists
            local pid_file="$SCRIPT_DIR/.$service.pid"
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                if [ -n "$pid" ]; then
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 1
                    kill -KILL "$pid" 2>/dev/null || true
                fi
                rm -f "$pid_file"
            fi
            echo -e "${YELLOW}$service_name stopped${NC}"
            ;;
        *)
    esac
}

stop_all_services() {
    echo -e "${YELLOW}${ICON_WARNING} Stopping all services...${NC}"
    
    for service in "${!SERVICES[@]}"; do
        stop_service "$service"
    done
    
    # Clean up any remaining processes more aggressively
    echo -e "${DIM}Cleaning up any remaining processes...${NC}"
    
    # Kill all pnpm dev processes (including watch)
    pkill -f "pnpm.*dev" 2>/dev/null || true
    pkill -f "pnpm.*watch" 2>/dev/null || true
    
    # Kill any remaining vite processes
    pkill -f "vite" 2>/dev/null || true
    
    # Kill any remaining TypeScript compiler processes
    pkill -f "tsc.*watch" 2>/dev/null || true
    
    # Kill any node processes on our service ports
    for port in "${SERVICE_PORTS[@]}"; do
        local pids=$(lsof -t -i ":$port" 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                kill -TERM "$pid" 2>/dev/null || true
            done
        fi
    done
    
    # Wait a moment for graceful shutdown
    sleep 2
    
    # Force kill any remaining processes on our ports
    for port in "${SERVICE_PORTS[@]}"; do
        local pids=$(lsof -t -i ":$port" 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                kill -KILL "$pid" 2>/dev/null || true
            done
        fi
    done
    
    # Clean up all PID files
    rm -f "$SCRIPT_DIR"/.*.pid 2>/dev/null || true
    
    echo -e "${GREEN}${ICON_SUCCESS} All services stopped${NC}"
}

# Quiet version for shutdown
stop_all_services_quiet() {
    for service in "${!SERVICES[@]}"; do
        case "$service" in
            "redis")
                docker stop gitray-redis >/dev/null 2>&1 || true
                docker rm gitray-redis >/dev/null 2>&1 || true
                ;;
            "frontend")
                # Kill all vite processes
                pkill -f "vite" >/dev/null 2>&1 || true
                pkill -f "pnpm.*frontend.*dev" >/dev/null 2>&1 || true
                local pid_file="$SCRIPT_DIR/.$service.pid"
                if [ -f "$pid_file" ]; then
                    local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                    if [ -n "$pid" ]; then
                        kill -TERM "$pid" >/dev/null 2>&1 || true
                        sleep 1
                        kill -KILL "$pid" >/dev/null 2>&1 || true
                    fi
                    rm -f "$pid_file" >/dev/null 2>&1 || true
                fi
                ;;
            "backend")
                local port="${SERVICE_PORTS[$service]:-}"
                if [ -n "$port" ]; then
                    local pids=$(lsof -t -i ":$port" 2>/dev/null || echo "")
                    if [ -n "$pids" ]; then
                        for pid in $pids; do
                            kill -TERM "$pid" >/dev/null 2>&1 || true
                        done
                        sleep 1
                        for pid in $pids; do
                            kill -KILL "$pid" >/dev/null 2>&1 || true
                        done
                    fi
                fi
                pkill -f "pnpm.*backend.*dev" >/dev/null 2>&1 || true
                local pid_file="$SCRIPT_DIR/.$service.pid"
                if [ -f "$pid_file" ]; then
                    local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                    if [ -n "$pid" ]; then
                        kill -TERM "$pid" >/dev/null 2>&1 || true
                        sleep 1
                        kill -KILL "$pid" >/dev/null 2>&1 || true
                    fi
                    rm -f "$pid_file" >/dev/null 2>&1 || true
                fi
                ;;
            "shared-types")
                # Kill TypeScript compiler watch processes
                pkill -f "tsc.*watch" >/dev/null 2>&1 || true
                pkill -f "pnpm.*shared-types.*watch" >/dev/null 2>&1 || true
                local pid_file="$SCRIPT_DIR/.$service.pid"
                if [ -f "$pid_file" ]; then
                    local pid=$(cat "$pid_file" 2>/dev/null || echo "")
                    if [ -n "$pid" ]; then
                        kill -TERM "$pid" >/dev/null 2>&1 || true
                        sleep 1
                        kill -KILL "$pid" >/dev/null 2>&1 || true
                    fi
                    rm -f "$pid_file" >/dev/null 2>&1 || true
                fi
                ;;
            *)
        esac
    done
    
    # Clean up any remaining processes
    pkill -f "pnpm.*dev" >/dev/null 2>&1 || true
    pkill -f "vite" >/dev/null 2>&1 || true
    
    # Force kill any processes on our service ports
    for port in "${SERVICE_PORTS[@]}"; do
        local pids=$(lsof -t -i ":$port" 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                kill -KILL "$pid" >/dev/null 2>&1 || true
            done
        fi
    done
    
    # Clean up all PID files
    rm -f "$SCRIPT_DIR"/.*.pid >/dev/null 2>&1 || true
}


# ============================================================================
# DEVELOPMENT WORKFLOWS
# ============================================================================

full_development_setup() {
    echo -e "${MAGENTA}${ICON_ROCKET} Full Development Setup${NC}"
    echo
    
    # Remove any existing traps and set up our own
    trap 'graceful_shutdown' INT TERM
    
    # 1. Install dependencies
    echo -e "${BLUE}${ICON_GEAR} Installing dependencies...${NC}"
    CURRENT_OPERATION="Installing dependencies"
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    if [ -f "pnpm-lock.yaml" ]; then
        if ! pnpm install --frozen-lockfile; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}${ICON_WARNING} No lockfile found, generating one...${NC}"
        if ! pnpm install; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 2. Build shared types
    echo -e "${BLUE}${ICON_GEAR} Building shared types...${NC}"
    CURRENT_OPERATION="Building shared types"
    
    if ! pnpm --filter @gitray/shared-types build; then
        echo -e "${RED}${ICON_ERROR} Failed to build shared types${NC}"
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 3. Start shared types watcher
    echo
    if ! start_service "shared-types"; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 4. Start Redis
    echo
    if ! start_service "redis" false; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 5. Start backend
    echo
    if ! start_service "backend"; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 6. Start frontend  
    echo
    if ! start_service "frontend"; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    CURRENT_OPERATION=""
    echo
    echo -e "${GREEN}${ICON_SUCCESS} Development environment ready!${NC}"
    echo -e "${CYAN}Frontend: http://localhost:${SERVICE_PORTS[frontend]}${NC}"
    echo -e "${CYAN}Backend:  http://localhost:${SERVICE_PORTS[backend]}${NC}"
    echo -e "${CYAN}Redis:    http://localhost:${SERVICE_PORTS[redis]}${NC}"
    echo
    echo -e "${YELLOW}Commands available:${NC}"
    echo -e "${DIM}  • Press 'l' to view live logs${NC}"
    echo -e "${DIM}  • Press 's' to show service status${NC}"
    echo -e "${DIM}  • Press Ctrl+C to stop all services and exit${NC}"
    echo -e "${DIM}  • In logs: Press 'q' to return to monitoring${NC}"
    echo
    
    # Interactive monitoring loop - this now NEVER returns to main menu
    local initial_status_shown=false
    
    # Show status every 10 seconds automatically
    local status_counter=0
    while [ "$SCRIPT_RUNNING" = "true" ]; do
        read -t 1 -n 1 input 2>/dev/null || {
            status_counter=$((status_counter + 1))
            if [ $status_counter -ge 10 ]; then
                if [ "$initial_status_shown" = "false" ]; then
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                else
                    # Move cursor up to overwrite the entire status block including timestamp and commands
                    # 1 (auto-refresh) + 10 (status) + 1 (commands) + 1 (blank) = 13 lines
                    printf "\033[13A"
                    printf "\033[J"
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                fi
                status_counter=0
            fi
            continue
        }
        
        case "$input" in
            'l'|'L')
                status_counter=0
                echo
                echo -e "${CYAN}${ICON_INFO} Live Logs (Press 'q' to return)${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
                
                # Start log viewing in background - only include existing log files
                local log_files=()
                [ -f "$SCRIPT_DIR/.backend.log" ] && log_files+=("$SCRIPT_DIR/.backend.log")
                [ -f "$SCRIPT_DIR/.frontend.log" ] && log_files+=("$SCRIPT_DIR/.frontend.log")
                [ -f "$SCRIPT_DIR/.shared-types.log" ] && log_files+=("$SCRIPT_DIR/.shared-types.log")
                
                if [ ${#log_files[@]} -gt 0 ]; then
                    # Use multitail if available for better multi-file display
                    if command -v multitail >/dev/null 2>&1; then
                        local multitail_cmd="multitail -s 2"
                        [ -f "$SCRIPT_DIR/.backend.log" ] && multitail_cmd+=" -ci green -t \"Backend\" \"$SCRIPT_DIR/.backend.log\""
                        [ -f "$SCRIPT_DIR/.frontend.log" ] && multitail_cmd+=" -ci blue -t \"Frontend\" \"$SCRIPT_DIR/.frontend.log\""
                        [ -f "$SCRIPT_DIR/.shared-types.log" ] && multitail_cmd+=" -ci yellow -t \"Shared Types\" \"$SCRIPT_DIR/.shared-types.log\""
                        # Run multitail in background but capture PID for cleanup
                        eval "$multitail_cmd" &
                        local tail_pid=$!
                    else
                        # Fallback: use tail with better formatting and strip ANSI codes
                        (
                            for logfile in "${log_files[@]}"; do
                                tail -f "$logfile" 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | while IFS= read -r line; do
                                    basename_log=$(basename "$logfile" .log)
                                    printf "[%s] %s\n" "$basename_log" "$line"
                                done &
                            done
                            wait
                        ) &
                        local tail_pid=$!
                    fi
                else
                    echo "No log files available yet"
                    continue
                fi
                
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        echo -e "\n${GREEN}${ICON_SUCCESS} Returned to monitoring${NC}"
                        echo
                        show_system_status
                        echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                        echo
                        initial_status_shown=true
                        break
                    fi
                done
                ;;
            's'|'S')
                status_counter=0
                if [ "$initial_status_shown" = "true" ]; then
                    # Move cursor up to overwrite the commands line and status block
                    # 1 (commands) + 1 (blank) = 2 lines to get back to status start
                    printf "\033[2A"
                    printf "\033[J"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                else
                    echo
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                fi
                ;;
        esac
    done
}

quick_start() {
    echo -e "${YELLOW}${ICON_ROCKET} Quick Start (Frontend Only)${NC}"
    echo
    
    # Remove any existing traps and set up our own
    trap 'graceful_shutdown' INT TERM
    
    # 1. Install dependencies (same as full setup)
    echo -e "${BLUE}${ICON_GEAR} Installing dependencies...${NC}"
    CURRENT_OPERATION="Installing dependencies"
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    if [ -f "pnpm-lock.yaml" ]; then
        if ! pnpm install --frozen-lockfile; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}${ICON_WARNING} No lockfile found, generating one...${NC}"
        if ! pnpm install; then
            echo -e "${RED}${ICON_ERROR} Failed to install dependencies${NC}"
            return 1
        fi
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 2. Build shared types (same as full setup)
    echo -e "${BLUE}${ICON_GEAR} Building shared types...${NC}"
    CURRENT_OPERATION="Building shared types"
    
    if ! pnpm --filter @gitray/shared-types build; then
        echo -e "${RED}${ICON_ERROR} Failed to build shared types${NC}"
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 3. Start shared types watcher
    echo
    if ! start_service "shared-types"; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    # 4. Start only frontend
    echo
    if ! start_service "frontend"; then
        return 1
    fi
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    CURRENT_OPERATION=""
    echo
    echo -e "${GREEN}${ICON_SUCCESS} Frontend development environment ready!${NC}"
    echo -e "${CYAN}Frontend: http://localhost:${SERVICE_PORTS[frontend]}${NC}"
    echo
    echo -e "${YELLOW}Commands available:${NC}"
    echo -e "${DIM}  • Press 'l' to view live logs${NC}"
    echo -e "${DIM}  • Press 's' to show service status${NC}"
    echo -e "${DIM}  • Press Ctrl+C to stop all services and exit${NC}"
    echo -e "${DIM}  • In logs: Press 'q' to return to monitoring${NC}"
    echo
    
    # Interactive monitoring loop - this now NEVER returns to main menu
    local initial_status_shown=false
    
    # Show status every 10 seconds automatically
    local status_counter=0
    while [ "$SCRIPT_RUNNING" = "true" ]; do
        read -t 1 -n 1 input 2>/dev/null || {
            status_counter=$((status_counter + 1))
            if [ $status_counter -ge 10 ]; then
                if [ "$initial_status_shown" = "false" ]; then
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                else
                    # Move cursor up to overwrite the entire status block including timestamp and commands
                    # 1 (auto-refresh) + 10 (status) + 1 (commands) + 1 (blank) = 13 lines
                    printf "\033[13A"
                    printf "\033[J"
                    echo -e "${DIM}Auto-refresh: $(date '+%H:%M:%S')${NC}"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                fi
                status_counter=0
            fi
            continue
        }
        
        case "$input" in
            'l'|'L')
                status_counter=0
                echo
                echo -e "${CYAN}${ICON_INFO} Live Logs (Press 'q' to return)${NC}"
                echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
                
                # Start log viewing in background - only include existing log files for quick start
                local log_files=()
                [ -f "$SCRIPT_DIR/.frontend.log" ] && log_files+=("$SCRIPT_DIR/.frontend.log")
                [ -f "$SCRIPT_DIR/.shared-types.log" ] && log_files+=("$SCRIPT_DIR/.shared-types.log")
                
                if [ ${#log_files[@]} -gt 0 ]; then
                    # Use multitail if available for better multi-file display
                    if command -v multitail >/dev/null 2>&1; then
                        local multitail_cmd="multitail -s 2"
                        [ -f "$SCRIPT_DIR/.frontend.log" ] && multitail_cmd+=" -ci blue -t \"Frontend\" \"$SCRIPT_DIR/.frontend.log\""
                        [ -f "$SCRIPT_DIR/.shared-types.log" ] && multitail_cmd+=" -ci yellow -t \"Shared Types\" \"$SCRIPT_DIR/.shared-types.log\""
                        eval "$multitail_cmd" 2>/dev/null &
                        local tail_pid=$!
                    else
                        # Fallback: use tail with better formatting and strip ANSI codes
                        (
                            for logfile in "${log_files[@]}"; do
                                tail -f "$logfile" 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | while IFS= read -r line; do
                                    basename_log=$(basename "$logfile" .log)
                                    printf "[%s] %s\n" "$basename_log" "$line"
                                done &
                            done
                            wait
                        ) &
                        local tail_pid=$!
                    fi
                else
                    echo "No log files available yet"
                    continue
                fi
                
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        echo -e "\n${GREEN}${ICON_SUCCESS} Returned to monitoring${NC}"
                        echo
                        show_system_status
                        echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                        echo
                        initial_status_shown=true
                        break
                    fi
                done
                ;;
            's'|'S')
                status_counter=0
                if [ "$initial_status_shown" = "true" ]; then
                    # Move cursor up to overwrite the commands line and status block
                    # 1 (commands) + 1 (blank) = 2 lines to get back to status start
                    printf "\033[2A"
                    printf "\033[J"
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                else
                    echo
                    show_system_status
                    echo -e "${DIM}Commands: 'l' logs • 's' status • Ctrl+C exit${NC}"
                    echo
                    initial_status_shown=true
                fi
                ;;
        esac
    done
}

production_build() {
    echo -e "${MAGENTA}${ICON_GEAR} Production Build${NC}"
    echo
    
    CURRENT_OPERATION="Production build"
    
    echo -e "${BLUE}Cleaning previous builds...${NC}"
    CURRENT_OPERATION="Cleaning previous builds"
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    pnpm run clean:dist
    
    echo -e "${BLUE}Installing dependencies...${NC}"
    CURRENT_OPERATION="Installing dependencies"
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        echo -e "${YELLOW}${ICON_WARNING} No lockfile found, generating one...${NC}"
        pnpm install
    fi
    
    echo -e "${BLUE}Building all packages...${NC}"
    CURRENT_OPERATION="Building all packages"
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    pnpm run build
    
    CURRENT_OPERATION=""
    echo -e "${GREEN}${ICON_SUCCESS} Production build completed!${NC}"
    echo -e "${DIM}Build artifacts are in packages/*/dist and apps/*/dist${NC}"
    echo
    echo -e "${DIM}Press Enter to return to main menu...${NC}"
    read
}

run_tests() {
    echo -e "${CYAN}${ICON_TEST} Test Suite${NC}"
    echo
    
    echo "1) ${ICON_TEST} Run all tests"
    echo "2) ${ICON_TEST} Frontend tests only"
    echo "3) ${ICON_TEST} Backend tests only"
    echo "4) ${ICON_TEST} Tests with coverage"
    echo "5) ${ICON_TEST} Watch mode"
    echo
    
    read -p "Choose test option (1-5): " choice
    
    CURRENT_OPERATION="Running tests"
    
    case $choice in
        1) 
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                pnpm run test
            fi
            ;;
        2) 
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                pnpm run test:frontend
            fi
            ;;
        3) 
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                pnpm run test:backend
            fi
            ;;
        4) 
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                pnpm run test:coverage
            fi
            ;;
        5) 
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                pnpm run test:watch
            fi
            ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    
    CURRENT_OPERATION=""
    echo
    echo -e "${DIM}Press Enter to return to main menu...${NC}"
    read
}

clean_environment() {
    echo -e "${RED}${ICON_CLEAN} Environment Cleanup${NC}"
    echo
    echo -e "${YELLOW}This will remove all build artifacts, dependencies, and stop services${NC}"
    read -p "Are you sure? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        CURRENT_OPERATION="Cleaning environment"
        stop_all_services
        if [ "$SCRIPT_RUNNING" = "true" ]; then
            echo -e "${BLUE}Cleaning build artifacts...${NC}"
            pnpm run clean
            echo -e "${GREEN}${ICON_SUCCESS} Environment cleaned${NC}"
        fi
        CURRENT_OPERATION=""
    fi
    
    echo
    echo -e "${DIM}Press Enter to return to main menu...${NC}"
    read
}

# ============================================================================
# INTERACTIVE MENU
# ============================================================================

show_main_menu() {
    while [ "$SCRIPT_RUNNING" = "true" ]; do
        print_header
        show_system_status
        
        echo -e "${BOLD}${WHITE}Development Actions:${NC}"
        echo
        echo "  1) ${ICON_ROCKET} Full Setup    (Redis + Backend + Frontend)"
        echo "  2) ${ICON_SERVER} Quick Start   (Frontend only)"
        echo "  3) ${ICON_GEAR} Production     (Build for production)"
        echo "  4) ${ICON_TEST} Test Suite     (Run tests)"
        echo "  5) ${ICON_CLEAN} Clean          (Reset environment)"
        echo "  6) ${ICON_DOCKER} Services       (Manage individual services)"
        echo "  7) ${ICON_INFO} Logs           (View service logs)"
        echo -e "  8) ${RED}Exit${NC}"
        echo
        
        read -p "Choose action (1-8): " choice
        
        if [ "$SCRIPT_RUNNING" = "false" ]; then
            break
        fi
        
        case $choice in
            1) full_development_setup ;;
            2) quick_start ;;
            3) 
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    production_build
                fi
                ;;
            4) 
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    run_tests
                fi
                ;;
            5) 
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    clean_environment
                fi
                ;;
            6) 
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    service_management_menu
                fi
                ;;
            7) 
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    show_logs
                fi
                ;;
            8) 
                graceful_shutdown
                ;;
            *) 
                echo -e "${RED}Invalid choice. Please try again.${NC}"
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    sleep 1
                fi
                ;;
        esac
    done
}

service_management_menu() {
    while [ "$SCRIPT_RUNNING" = "true" ]; do
        print_header
        show_system_status
        
        echo -e "${BOLD}${WHITE}Service Management:${NC}"
        echo
        echo "  1) Start Redis"
        echo "  2) Start Backend"
        echo "  3) Start Frontend"
        echo "  4) Start Shared Types Watcher"
        echo "  5) Stop All Services"
        echo "  6) Restart All Services"
        echo "  7) Back to Main Menu"
        echo
        
        read -p "Choose action (1-7): " choice
        
        if [ "$SCRIPT_RUNNING" = "false" ]; then
            break
        fi
        
        case $choice in
            1) start_service "redis" ;;
            2) start_service "backend" ;;
            3) start_service "frontend" ;;
            4) start_service "shared-types" ;;
            5) 
                echo -e "${BLUE}${ICON_GEAR} Stopping all services...${NC}"
                stop_all_services_quiet
                echo -e "${GREEN}${ICON_SUCCESS} All services stopped${NC}"
                ;;
            6) 
                echo -e "${BLUE}${ICON_GEAR} Restarting all services...${NC}"
                stop_all_services_quiet
                if [ "$SCRIPT_RUNNING" = "true" ]; then
                    sleep 2
                    echo -e "${DIM}Starting services...${NC}"
                    start_service "redis" false
                    if [ "$SCRIPT_RUNNING" = "true" ]; then
                        start_service "shared-types" false
                    fi
                    if [ "$SCRIPT_RUNNING" = "true" ]; then
                        start_service "backend" false
                    fi
                    if [ "$SCRIPT_RUNNING" = "true" ]; then
                        start_service "frontend" false
                    fi
                    echo -e "${GREEN}${ICON_SUCCESS} All services restarted${NC}"
                fi
                ;;
            7) break ;;
            *) echo -e "${RED}Invalid choice${NC}" ;;
        esac
        
        if [ "$SCRIPT_RUNNING" = "true" ]; then
            echo
            read -p "Press Enter to continue..."
        fi
    done
}

show_logs() {
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    echo -e "${CYAN}${ICON_INFO} Service Logs${NC}"
    echo
    echo "1) ${ICON_INFO} Live Combined Logs (All services)"
    echo "2) ${ICON_SERVER} Backend Logs"
    echo "3) ${ICON_SERVER} Frontend Logs"
    echo "4) ${ICON_GEAR} Shared Types Watcher Logs"
    echo "5) ${ICON_GEAR} GitRay Main Log"
    echo "6) ${ICON_WARNING} Recent Errors Only"
    echo "7) ${ICON_INFO} Service Status + Last 10 Lines"
    echo
    
    read -p "Choose log view (1-7): " choice
    
    if [ "$SCRIPT_RUNNING" = "false" ]; then
        return 1
    fi
    
    echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
    echo -e "${DIM}Press 'q' to return to menu (or Ctrl+C to exit completely)${NC}"
    echo -e "${GRAY}$(printf '%.0s─' {1..60})${NC}"
    
    case $choice in
        1) 
            if [ -f "$SCRIPT_DIR/.backend.log" ] || [ -f "$SCRIPT_DIR/.frontend.log" ] || [ -f "$SCRIPT_DIR/.shared-types.log" ]; then
                # Collect existing log files
                local log_files=()
                [ -f "$SCRIPT_DIR/.backend.log" ] && log_files+=("$SCRIPT_DIR/.backend.log")
                [ -f "$SCRIPT_DIR/.frontend.log" ] && log_files+=("$SCRIPT_DIR/.frontend.log") 
                [ -f "$SCRIPT_DIR/.shared-types.log" ] && log_files+=("$SCRIPT_DIR/.shared-types.log")
                
                if [ ${#log_files[@]} -gt 0 ]; then
                    # Use multitail if available, otherwise fall back to formatted tail
                    if command -v multitail >/dev/null 2>&1; then
                        # Build multitail command with existing files only
                        local multitail_cmd="multitail -s 2"
                        [ -f "$SCRIPT_DIR/.backend.log" ] && multitail_cmd+=" -ci green -t \"Backend\" \"$SCRIPT_DIR/.backend.log\""
                        [ -f "$SCRIPT_DIR/.frontend.log" ] && multitail_cmd+=" -ci blue -t \"Frontend\" \"$SCRIPT_DIR/.frontend.log\""
                        [ -f "$SCRIPT_DIR/.shared-types.log" ] && multitail_cmd+=" -ci yellow -t \"Shared Types\" \"$SCRIPT_DIR/.shared-types.log\""
                        # Run multitail interactively (it handles its own exit on 'q')
                        eval "$multitail_cmd"
                    else
                        # Fallback: use formatted tail with service labels and strip ANSI codes
                        {
                            trap 'kill $(jobs -p) 2>/dev/null || true; exit' INT TERM
                            for logfile in "${log_files[@]}"; do
                                tail -f "$logfile" 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | while IFS= read -r line; do
                                    basename_log=$(basename "$logfile" .log)
                                    printf "[%s] %s\n" "$basename_log" "$line"
                                done &
                            done
                            # Wait for user input to exit
                            while read -r -n 1 -s key; do
                                if [[ "$key" == "q" || "$key" == "Q" ]]; then
                                    break
                                fi
                            done
                            # Kill all background tail processes
                            kill $(jobs -p) 2>/dev/null || true
                        }
                    fi
                else
                    echo "No service logs available. Start some services first."
                    echo
                    echo -e "${DIM}Press Enter to return to main menu...${NC}"
                    read
                fi
            else
                echo "No service logs available. Start some services first."
                echo
                echo -e "${DIM}Press Enter to return to main menu...${NC}"
                read
            fi
            ;;
        2) 
            if [ -f "$SCRIPT_DIR/.backend.log" ]; then
                echo -e "${DIM}Press 'q' to return to menu${NC}"
                tail -f "$SCRIPT_DIR/.backend.log" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' &
                local tail_pid=$!
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        break
                    fi
                done
            else
                echo "Backend not running"
                echo
                echo -e "${DIM}Press Enter to return to main menu...${NC}"
                read
            fi
            ;;
        3) 
            if [ -f "$SCRIPT_DIR/.frontend.log" ]; then
                echo -e "${DIM}Press 'q' to return to menu${NC}"
                tail -f "$SCRIPT_DIR/.frontend.log" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' &
                local tail_pid=$!
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        break
                    fi
                done
            else
                echo "Frontend not running"
                echo
                echo -e "${DIM}Press Enter to return to main menu...${NC}"
                read
            fi
            ;;
        4) 
            if [ -f "$SCRIPT_DIR/.shared-types.log" ]; then
                echo -e "${DIM}Press 'q' to return to menu${NC}"
                tail -f "$SCRIPT_DIR/.shared-types.log" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' &
                local tail_pid=$!
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        break
                    fi
                done
            else
                echo "Shared types watcher not running"
                echo
                echo -e "${DIM}Press Enter to return to main menu...${NC}"
                read
            fi
            ;;
        5) 
            if [ -f "$LOG_FILE" ]; then
                echo -e "${DIM}Press 'q' to return to menu${NC}"
                tail -f "$LOG_FILE" | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' &
                local tail_pid=$!
                # Wait for 'q' to exit logs
                while [ "$SCRIPT_RUNNING" = "true" ]; do
                    read -t 1 -n 1 log_input 2>/dev/null || continue
                    if [[ "$log_input" == "q" || "$log_input" == "Q" ]]; then
                        kill $tail_pid 2>/dev/null
                        break
                    fi
                done
            else
                echo "No main log file found"
                echo
                echo -e "${DIM}Press Enter to return to main menu...${NC}"
                read
            fi
            ;;
        6)
            echo -e "${RED}Recent Errors:${NC}"
            grep -i "error\|fail\|exception" "$SCRIPT_DIR"/.*.log 2>/dev/null | tail -20 || echo "No recent errors found"
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                read -p "Press Enter to continue..."
            fi
            ;;
        7)
            show_system_status
            echo -e "${CYAN}Recent Log Output:${NC}"
            for service in backend frontend shared-types; do
                local log_file="$SCRIPT_DIR/.$service.log"
                if [ -f "$log_file" ]; then
                    echo -e "${YELLOW}Last 10 lines from $service:${NC}"
                    tail -10 "$log_file" 2>/dev/null | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'
                    echo -e "${GRAY}$(printf '%.0s─' {1..40})${NC}"
                fi
            done
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                read -p "Press Enter to continue..."
            fi
            ;;
        *) 
            echo -e "${RED}Invalid choice${NC}"
            echo
            echo -e "${DIM}Press Enter to return to main menu...${NC}"
            if [ "$SCRIPT_RUNNING" = "true" ]; then
                read
            fi
            ;;
    esac
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Setup
    check_dependencies
    mkdir -p "$(dirname "$LOG_FILE")"
    log "GitRay Development Environment Manager started"
    
    # Check for command line arguments
    case "${1:-}" in
        "start"|"dev") full_development_setup ;;
        "quick") quick_start ;;
        "build") production_build ;;
        "test") run_tests ;;
        "clean") clean_environment ;;
        "stop") stop_all_services ;;
        "status") print_header; show_system_status ;;
        *) show_main_menu ;;
    esac
}

# Execute main function
main "$@"