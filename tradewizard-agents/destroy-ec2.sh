#!/bin/bash
set -e

# TradeWizard EC2 Cleanup Script
# Destroys EC2 instance and all related AWS resources

# Configuration
KEY_NAME="${KEY_NAME:-tradewizard-key}"
SECURITY_GROUP_NAME="tradewizard-sg"
INSTANCE_NAME="tradewizard-agents"
REGION="${AWS_REGION:-us-east-1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo -e "${RED}🗑️  TradeWizard EC2 Cleanup${NC}"
echo "================================"
echo "This will destroy:"
echo "  - EC2 instance: $INSTANCE_NAME"
echo "  - Security group: $SECURITY_GROUP_NAME"
echo "  - Key pair: $KEY_NAME"
echo "  - Local key file: ${KEY_NAME}.pem"
echo ""
read -p "Are you sure you want to continue? (yes/no) " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_warn "Cleanup cancelled"
    exit 0
fi

# Check AWS CLI
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

log_info "AWS Account: $(aws sts get-caller-identity --query Account --output text)"

# Find and terminate EC2 instance
log_info "Looking for EC2 instance..."
INSTANCE_ID=$(aws ec2 describe-instances \
    --region $REGION \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
              "Name=instance-state-name,Values=running,stopped,stopping,pending" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" != "None" ] && [ -n "$INSTANCE_ID" ]; then
    log_info "Found instance: $INSTANCE_ID"
    
    # Get instance details before termination
    INSTANCE_IP=$(aws ec2 describe-instances \
        --region $REGION \
        --instance-ids $INSTANCE_ID \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null || echo "N/A")
    
    log_info "Instance IP: $INSTANCE_IP"
    log_warn "Terminating instance..."
    
    aws ec2 terminate-instances \
        --region $REGION \
        --instance-ids $INSTANCE_ID \
        --output text > /dev/null
    
    log_info "Waiting for instance to terminate..."
    aws ec2 wait instance-terminated \
        --region $REGION \
        --instance-ids $INSTANCE_ID 2>/dev/null || true
    
    log_info "✅ Instance terminated: $INSTANCE_ID"
else
    log_warn "No instance found with name: $INSTANCE_NAME"
fi

# Delete security group
log_info "Looking for security group..."
SG_ID=$(aws ec2 describe-security-groups \
    --region $REGION \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

if [ "$SG_ID" != "None" ] && [ -n "$SG_ID" ]; then
    log_info "Found security group: $SG_ID"
    
    # Wait a bit for instance termination to complete
    log_info "Waiting for dependencies to clear..."
    sleep 10
    
    # Try to delete security group (may fail if still in use)
    log_warn "Deleting security group..."
    if aws ec2 delete-security-group \
        --region $REGION \
        --group-id $SG_ID 2>/dev/null; then
        log_info "✅ Security group deleted: $SG_ID"
    else
        log_error "Failed to delete security group. It may still be in use."
        log_warn "Try again in a few minutes with:"
        log_warn "  aws ec2 delete-security-group --region $REGION --group-id $SG_ID"
    fi
else
    log_warn "No security group found with name: $SECURITY_GROUP_NAME"
fi

# Delete key pair from AWS
log_info "Looking for key pair..."
if aws ec2 describe-key-pairs \
    --region $REGION \
    --key-names $KEY_NAME &> /dev/null; then
    
    log_warn "Deleting key pair from AWS..."
    aws ec2 delete-key-pair \
        --region $REGION \
        --key-name $KEY_NAME
    
    log_info "✅ Key pair deleted from AWS: $KEY_NAME"
else
    log_warn "No key pair found in AWS with name: $KEY_NAME"
fi

# Delete local key file
if [ -f "${KEY_NAME}.pem" ]; then
    log_warn "Deleting local key file..."
    rm -f "${KEY_NAME}.pem"
    log_info "✅ Local key file deleted: ${KEY_NAME}.pem"
else
    log_warn "No local key file found: ${KEY_NAME}.pem"
fi

# Delete instance info file
if [ -f "instance-info.txt" ]; then
    log_warn "Deleting instance info file..."
    rm -f "instance-info.txt"
    log_info "✅ Instance info file deleted"
fi

# Delete user-data script if it exists
if [ -f "user-data.sh" ]; then
    rm -f "user-data.sh"
fi

echo ""
echo -e "${GREEN}✅ Cleanup Complete${NC}"
echo "================================"
echo "All TradeWizard EC2 resources have been destroyed."
echo ""
echo "Summary:"
echo "  ✓ EC2 instance terminated"
echo "  ✓ Security group deleted (or marked for deletion)"
echo "  ✓ Key pair removed from AWS"
echo "  ✓ Local key file deleted"
echo ""
echo "Note: It may take a few minutes for all resources to be fully removed."
echo "You can verify with:"
echo "  aws ec2 describe-instances --region $REGION --filters \"Name=tag:Name,Values=$INSTANCE_NAME\""
